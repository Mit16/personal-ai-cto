import { pool } from "../db.js";
import {
  detectDrift,
  updateDailyActivity,
  getActiveDriftEvents,
} from "./drift.js";
import { sendEnforcementMessage, formatDriftMessage } from "./discord.js";

/**
 * Daily enforcement jon
 * This runs once per day and enforces discipline
 */
export async function runDailyEnforcement(): Promise<void> {
  console.log("Running daily enforcement check...");

  try {
    // 1. Update today's activity
    await updateDailyActivity();

    // 2. Detect drift
    const driftStatus = await detectDrift();

    // 3. If drifting, send enforcement message
    if (driftStatus.isDrifting) {
      const message = formatDriftMessage(
        driftStatus.driftTypes,
        driftStatus.details,
      );

      await sendEnforcementMessage(message, "drift");

      console.log("❌ Drift detected. Enforcement message sent.");
    } else {
      console.log("✅ No drift detected. No action required.");
    }

    // 4. Log enforcement run
    await logEnforcementRun(driftStatus.isDrifting, driftStatus.driftTypes);
  } catch (error) {
    console.error("Daily enforcement failed:", error);
    throw error;
  }
}

/**
 * Log enforcement runs for audit trail
 */
async function logEnforcementRun(
  isDrifting: boolean,
  driftTypes: string[],
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO system_events (type, payload_json)
       VALUES ($1, $2)`,
      [
        "enforcement_run",
        JSON.stringify({
          is_drifting: isDrifting,
          drift_types: driftTypes,
          timestamp: new Date(),
        }),
      ],
    );
  } catch (error) {
    console.error("Failed to log enforcement run:", error);
  }
}

/**
 * Check if enforcement should run today
 * (Prevents multiple runs per day)
 */
export async function shouldRunEnforcement(): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM system_events
       WHERE type = 'enforcement_run'
       AND DATE(created_at) = CURRENT_DATE`,
    );

    const runsToday = parseInt(result.rows[0].count);
    return runsToday === 0;
  } catch (error) {
    console.error("Failed to check enforcement status:", error);
    return false;
  }
}
