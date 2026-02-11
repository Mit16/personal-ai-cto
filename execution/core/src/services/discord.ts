import axios from "axios";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

interface EnforcementMessage {
  type: "drift" | "idle" | "warning";
  message: string;
}

/**
 * Send enforcement message to Discord
 * No softeners. No encouragement. Just Facts.
 */
export async function sendEnforcementMessage(
  message: string,
  type: "drift" | "idle" | "warning" = "warning",
): Promise<void> {
  if (!DISCORD_WEBHOOK_URL) {
    console.warn(
      "DISCORD_WEBHOOK_URL not configured. Skipping Discord notification.",
    );
    return;
  }

  try {
    await axios.post(DISCORD_WEBHOOK_URL, {
      content: message,
      username: "AI CTO",
      avatar_url:
        "https://www.flaticon.com/free-icon/artificial-intelligence_18525350?term=robot&page=1&position=8&origin=search&related_id=18525350", // Robot icon
    });

    console.log(`Enforcement message sent: ${type}`);
  } catch (error) {
    console.error("Failed to send Discord message:", error);
    throw error;
  }
}

/**
 * Format drift message (no politeness)
 */
export function formatDriftMessage(driftTypes: string[], details: any): string {
  const messages: string[] = [];

  if (driftTypes.includes("idle")) {
    messages.push(
      `⚠️ **IDLE DRIFT DETECTED**\nNo commits for ${details.idleDays} days.\nCorrect course.`,
    );
  }

  if (driftTypes.includes("misalignment")) {
    messages.push(
      `⚠️ **MISALIGNMENT DRIFT DETECTED**\n${details.lowAlignmentReviews} recent commits not aligned with goals.\nRefocus.`,
    );
  }

  if (driftTypes.includes("quality")) {
    messages.push(
      `⚠️ **QUALITY DRIFT DETECTED**\n${details.lowQualityReviews} recent commits marked low quality.\nRaise standards.`,
    );
  }

  return messages.join("\n\n");
}

/**
 * Format weekly summary message (exposes patterns)
 */
export function formatWeeklySummary(summary: any): string {
  const failureModeEmoji: any = {
    idle: "😴",
    misaligned_work: "🎯",
    low_quality_output: "⚠️",
    inconsistent_execution: "📉",
    no_clear_pattern: "❓",
    on_track: "✅",
  };

  const emoji = failureModeEmoji[summary.dominant_failure_mode] || "📊";

  return `${emoji} **WEEKLY SUMMARY**

**Pattern:**
${summary.execution_summary}

**Dominant Failure Mode:** ${summary.dominant_failure_mode.replace(/_/g, " ").toUpperCase()}

**Metrics:**
- Commit frequency: ${summary.metrics?.commit_frequency || "unknown"}
- Alignment trend: ${summary.metrics?.alignment_trend || "unknown"}
- Quality trend: ${summary.metrics?.quality_trend || "unknown"}

**Required Action:**
${summary.recommendation}`;
}
