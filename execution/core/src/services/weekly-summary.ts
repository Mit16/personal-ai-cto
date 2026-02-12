import { pool } from "../db";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import fs from "fs";
import path, {dirname} from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load schema
const schemaPath = path.join(
  __dirname,
  "../../intelligence/schemas/weekly_summary.json",
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv();
const validateSchema = ajv.compile(schema);

const LLM_PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

interface WeeklySummaryResponse {
  execution_summary: string;
  dominant_failure_mode:
    | "idle"
    | "misaligned_work"
    | "low_quality_output"
    | "inconsistent_execution"
    | "no_clear_pattern"
    | "on_track";
  recommendation: string;
  metrics?: {
    commit_frequency: "daily" | "sporadic" | "rare" | "none";
    alignment_trend: "improving" | "stable" | "declining" | "inconsistent";
    quality_trend: "improving" | "stable" | "declining" | "inconsistent";
  };
}

interface WeeklyData {
  commitCount: number;
  avgAlignmentScore: number | null;
  avgQualityScore: number;
  topArchitectureIssues: string[];
  topCodeSmells: string[];
  driftEvents: Array<{ type: string; description: string; timestamp: Date }>;
  dailyActivity: Array<{ date: Date; commit_count: number; status: string }>;
}

/**
 * Gather data for the past 7 days
 */
export async function gatherWeeklyData(): Promise<WeeklyData> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Commits in last 7 days
  const commitsResult = await pool.query(
    "SELECT COUNT(*) FROM commits WHERE timestamp >= $1",
    [sevenDaysAgo],
  );
  const commitCount = parseInt(commitsResult.rows[0].count);

  // Average alignment score from reviews
  const alignmentResult = await pool.query(
    `SELECT AVG((llm_output_json->>'alignment_score')::float) as avg_score
     FROM reviews
     WHERE created_at >= $1`,
    [sevenDaysAgo],
  );

  const avgAlignmentScore = alignmentResult.rows[0].avg_score
    ? parseFloat(alignmentResult.rows[0].avg_score)
    : null;

  // Quality distribution
  const qualityResult = await pool.query(
    `SELECT llm_output_json->>'execution_quality' as quality, COUNT(*) as count
     FROM reviews
     WHERE created_at >= $1
     GROUP BY quality`,
    [sevenDaysAgo],
  );

  const qualityMap: any = { high: 0, medium: 0, low: 0 };
  qualityResult.rows.forEach((row) => {
    qualityMap[row.quality] = parseInt(row.count);
  });

  // Calculate average quality score (high=3, medium=2, low=1)
  const totalQuality =
    qualityMap.high * 3 + qualityMap.medium * 2 + qualityMap.low * 1;
  const totalReviews = qualityMap.high + qualityMap.medium + qualityMap.low;
  const avgQualityScore = totalReviews > 0 ? totalQuality / totalReviews : 0;

  // Top architecture issues
  const issuesResult = await pool.query(
    `SELECT jsonb_array_elements_text(llm_output_json->'architecture_issues') as issue
     FROM reviews
     WHERE created_at >= $1
     AND jsonb_array_length(llm_output_json->'architecture_issues') > 0`,
    [sevenDaysAgo],
  );

  const topArchitectureIssues = issuesResult.rows
    .map((r) => r.issue)
    .slice(0, 5);

  // Top code smells
  const smellsResult = await pool.query(
    `SELECT jsonb_array_elements_text(llm_output_json->'code_smells') as smell
     FROM reviews
     WHERE created_at >= $1
     AND jsonb_array_length(llm_output_json->'code_smells') > 0`,
    [sevenDaysAgo],
  );
  const topCodeSmells = smellsResult.rows.map((r) => r.smell).slice(0, 5);

  // Drift events
  const driftResult = await pool.query(
    "SELECT type, description, timestamp FROM drift_events WHERE timestamp >= $1 ORDER BY timestamp DESC",
    [sevenDaysAgo],
  );

  // Daily activity
  const activityResult = await pool.query(
    "SELECT date, commit_count, status FROM daily_activity WHERE date >= $1 ORDER BY date ASC",
    [sevenDaysAgo],
  );

  return {
    commitCount,
    avgAlignmentScore,
    avgQualityScore,
    topArchitectureIssues,
    topCodeSmells,
    driftEvents: driftResult.rows,
    dailyActivity: activityResult.rows,
  };
}

/**
 *  Generate weekly summary using LLM
 */
export async function generateWeeklySummary(): Promise<WeeklySummaryResponse> {
  const data = await gatherWeeklyData();
  const prompt = buildWeeklySummaryPrompt(data);

  let responseText: string;

  try {
    if (LLM_PROVIDER === "claude") {
      responseText = await callClaude(prompt);
    } else if (LLM_PROVIDER === "gemini") {
      responseText = await callGemini(prompt);
    } else {
      throw new Error(`Unsupported LLM provider: ${LLM_PROVIDER}`);
    }

    // FIX: Robust JSON extraction
    const firstBrace = responseText.indexOf("{");
    const lastBrace = responseText.lastIndexOf("}");

    // Check if the response was truncated (no closing brace)
    if (firstBrace !== -1 && lastBrace === -1) {
      console.error("DEBUG: Response was truncated! (Found start but no end)");
      console.error("Partial Output:", responseText);
      throw new Error("LLM response truncated (maxOutputTokens reached)");
    }

    if (firstBrace === -1 || lastBrace === -1) {
      console.error("DEBUG: No JSON structure found in:", responseText);
      throw new Error("No JSON object found in response");
    }
    const cleaned = responseText.substring(firstBrace, lastBrace + 1);
    const parsed = JSON.parse(cleaned);

    if (!validateSchema(parsed)) {
      console.error("Schema validation failed:", validateSchema.errors);
      throw new Error("LLM response does not match schema");
    }

    return parsed as WeeklySummaryResponse;
  } catch (error) {
    console.error("Weekly summary generation failed:", error);
    throw error;
  }
}

/**
 * Build prompt for weekly summary
 */
function buildWeeklySummaryPrompt(data: WeeklyData): string {
  const activityPattern = data.dailyActivity
    .map(
      (d) =>
        `${d.date.toISOString().split("T")[0]}: ${d.commit_count} commits (${d.status})`,
    )
    .join("\n");

  const driftSummary =
    data.driftEvents.length > 0
      ? data.driftEvents.map((e) => `- ${e.type}: ${e.description}`).join("\n")
      : "No drift events recorded";

  return `You are a technical CTO analyzing a developer's weekly performance.

WEEKLY DATA (Last 7 days):

COMMIT ACTIVITY:
Total commits: ${data.commitCount}
Daily pattern:
${activityPattern}

ALIGNMENT & QUALITY:
Average alignment score: ${data.avgAlignmentScore !== null ? data.avgAlignmentScore.toFixed(2) : "N/A"}
Average quality score: ${data.avgQualityScore.toFixed(2)} / 3.0

TOP ARCHITECTURE ISSUES:
${data.topArchitectureIssues.length > 0 ? data.topArchitectureIssues.map((i) => `- ${i}`).join("\n") : "None"}

TOP CODE SMELLS:
${data.topCodeSmells.length > 0 ? data.topCodeSmells.map((s) => `- ${s}`).join("\n") : "None"}

DRIFT EVENTS:
${driftSummary}

Analyze this pattern and respond ONLY with valid JSON matching this exact schema:
{
  "execution_summary": "string (max 300 chars - factual summary of work pattern)",
  "dominant_failure_mode": "idle" | "misaligned_work" | "low_quality_output" | "inconsistent_execution" | "no_clear_pattern" | "on_track",
  "recommendation": "string (max 200 chars - direct next action)",
  "metrics": {
    "commit_frequency": "daily" | "sporadic" | "rare" | "none",
    "alignment_trend": "improving" | "stable" | "declining" | "inconsistent",
    "quality_trend": "improving" | "stable" | "declining" | "inconsistent"
  }
}

Rules:
- execution_summary: Describe the PATTERN, not individual days
- dominant_failure_mode: What's the PRIMARY issue?
  * idle: Very few or no commits
  * misaligned_work: Working, but on wrong things
  * low_quality_output: High volume, low quality
  * inconsistent_execution: Sporadic, unpredictable
  * no_clear_pattern: Not enough data
  * on_track: Consistent, aligned, quality work
- recommendation: One clear action to fix the dominant failure
- No softeners. No praise unless truly deserved.

CRITICAL: Return ONLY the JSON object. No preamble. No explanation. Just pure JSON.`;
}

async function callClaude(prompt: string): Promise<string> {
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}

async function callGemini(prompt: string): Promise<string> {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 8192,
    },
  });

  if (!response.text) {
    console.error("Gemini returned empty response:", response);
    throw new Error("Gemini API returned no text");
  }

  return response.text;
}

/**
 * Store weekly summary in database
 */
export async function storeWeeklySummary(
  summary: WeeklySummaryResponse,
): Promise<void> {
  await pool.query(
    `INSERT INTO system_events (type, payload_json)
     VALUES ($1, $2)`,
    [
      "weekly_summary",
      JSON.stringify({
        ...summary,
        generated_at: new Date(),
      }),
    ],
  );
}
