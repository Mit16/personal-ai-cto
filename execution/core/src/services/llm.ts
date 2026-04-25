import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import Ajv from "ajv";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load schema
const schemaPath = path.join(
  __dirname,
  "../../../../intelligence/schemas/code_review.json",
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

  console.log(`[LLM] Requesting review from ${LLM_PROVIDER}...`);

  let responseText: string;
  try {
    if (LLM_PROVIDER === "claude") {
      responseText = await callClaude(prompt);
    } else if (LLM_PROVIDER === "gemini") {
      responseText = await callGemini(prompt);
    } else {
      throw new Error(`Unsupported LLM provider: ${LLM_PROVIDER}`);
    }

    // DEBUGGING: Print the raw response to see exactly what we got
    console.log("---------------------------------------------------");
    console.log(`[LLM] RAW RESPONSE (${LLM_PROVIDER}):`);
    console.log(responseText);
    console.log("---------------------------------------------------");

    // Parse and validate
    const parsed = cleanAndParseJSON(responseText);

    if (!validateSchema(parsed)) {
      console.error("Schema validation failed:", validateSchema.errors);
      throw new Error("LLM response does not match schema");
    }

    return parsed as CodeReviewResponse;
  } catch (error) {
    console.error("[LLM] Critical Failure:", error);
    throw error;
  }
}

function cleanAndParseJSON(text: string): any {
  try {
    // 1. Try direct parse (fastest)
    return JSON.parse(text);
  } catch (e) {
    // 2. Try stripping markdown code blocks
    try {
      const markdownStripped = text.replace(/```json\n?|\n?```/g, "").trim();
      return JSON.parse(markdownStripped);
    } catch (e2) {
      // 3. Robust Fallback: Extract substrings between first { and last }
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");

      if (firstBrace !== -1 && lastBrace !== -1) {
        const extracted = text.substring(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(extracted);
        } catch (e3) {
          throw new Error(
            `JSON Clean failed. Extracted: ${extracted.substring(0, 50)}...`,
          );
        }
      }
      throw new Error("No JSON object structure found in response");
    }
  }
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
        temperature: 0.2,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
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
