import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import fs from "fs";
import path from "path";

// Load schema
const schemaPath = path.join(
  process.cwd(),
  "../../intelligence/schemas/code_review.json",
);
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const ajv = new Ajv();
const validateSchema = ajv.compile(schema);

// Determine which provider to use
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

// Initialize clients
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

interface CodeReviewRequest {
  diff: string;
  commitMessage: string;
  activeGoals: Array<{ title: string; description: string | null }>;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface CodeReviewResponse {
  alignment_score: number;
  execution_quality: "low" | "medium" | "high";
  architecture_issues: string[];
  code_smells: string[];
  summary: string;
  recommended_action: string;
}

export async function reviewCode(
  request: CodeReviewRequest,
): Promise<CodeReviewResponse> {
  const prompt = buildPrompt(request);

  let responseText: string;

  if (LLM_PROVIDER === "claude") {
    responseText = await callClaude(prompt);
  } else if (LLM_PROVIDER === "gemini") {
    responseText = await callGemini(prompt);
  } else {
    throw new Error(`Unsupported LLM provider: ${LLM_PROVIDER}`);
  }

  // Parse and validate
  let parsed: any;
  try {
    const cleaned = responseText.replace(/```json\n?|\n?```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse LLM response:", responseText);
    throw new Error("LLM returned invalid JSON");
  }

  if (!validateSchema(parsed)) {
    console.error("Schema validation failed:", validateSchema.errors);
    throw new Error("LLM response does not match schema");
  }

  return parsed as CodeReviewResponse;
}

async function callClaude(prompt: string): Promise<string> {
  if (!anthropic) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : "";
}

async function callGemini(prompt: string): Promise<string> {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  try {
    const response = await genAI.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    });

    // Handle potential undefined response
    if (!response.text) {
      console.error("Gemini returned empty response:", response);
      throw new Error("Gemini API returned no text");
    }

    return response.text;
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error(
      `Failed to call Gemini API: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

function buildPrompt(request: CodeReviewRequest): string {
  const goalsSection =
    request.activeGoals.length > 0
      ? request.activeGoals
          .map(
            (g) => `- ${g.title}${g.description ? `: ${g.description}` : ""}`,
          )
          .join("\n")
      : "No active goals defined";

  return `You are a technical CTO reviewing a code commit.

ACTIVE GOALS:
${goalsSection}

COMMIT METADATA:
- Message: ${request.commitMessage}
- Files changed: ${request.filesChanged}
- Lines added: ${request.linesAdded}
- Lines removed: ${request.linesRemoved}

DIFF:
${request.diff}

Analyze this commit and respond ONLY with valid JSON matching this exact schema:
{
  "alignment_score": number (0.0 to 1.0),
  "execution_quality": "low" | "medium" | "high",
  "architecture_issues": [array of strings],
  "code_smells": [array of strings],
  "summary": "string (max 500 chars)",
  "recommended_action": "string (max 200 chars)"
}

Rules:
- alignment_score: How well does this commit advance the active goals? (0.0 = no alignment, 1.0 = perfect alignment)
- execution_quality: Technical quality (low = broken/rushed, medium = functional, high = well-crafted)
- architecture_issues: Structural problems, not nitpicks
- code_smells: Code quality issues
- summary: Factual assessment, no excessive praise
- recommended_action: What should happen next

CRITICAL: Return ONLY the JSON object. No preamble. No explanation. No markdown fences. Just pure JSON.`;
}

export function getCurrentProvider(): string {
  return LLM_PROVIDER;
}
