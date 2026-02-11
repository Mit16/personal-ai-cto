import { pool } from "../db.js";

// Configuration (hardcoded for now, can move to env later)
const IDLE_THRESHOLD_DAYS = 2;
const MISALIGNMENT_THRESHOLD = 0.4;
const MISALIGNMENT_COUNT = 3; // Number of recent reviews to check
const LOW_QUALITY_COUNT = 3; // Number of recent low-quality reviews

export interface DriftStatus {
  isDrifting: boolean;
  driftTypes: string[];
  details: {
    idleDays?: number;
    lowAlignmentReviews?: number;
    lowQualityReviews?: number;
  };
}

/**
 * Calculate daily activity and store in daily_activity table
 */
export async function updateDailyActivity(): Promise<void> {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Count commits today
    const result = await pool.query(
      "SELECT COUNT(*) FROM commits WHERE DATE(timestamp) = DATE($1)",
      [today],
    );

    const commitCount = parseInt(result.rows[0].count);
    const status = commitCount > 0 ? "active" : "idle";

    // Upsert daily activity
    await pool.query(
      `INSERT INTO daily_activity (date, commit_count, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) 
       DO UPDATE SET commit_count = $2, status = $3`,
      [today, commitCount, status],
    );

    console.log(
      `Daily activity updated: ${commitCount} commits, status: ${status}`,
    );
  } catch (error) {
    console.error("Failed to update daily activity:", error);
    throw error;
  }
}

/**
 * Detect all types of drift
 */
export async function detectDrift(): Promise<DriftStatus> {
  const driftTypes: string[] = [];
  const details: any = {};

  // 1. Check idle drift (no commits for N days)
  const idleDrift = await detectIdleDrift();
  if (idleDrift.isDrifting) {
    driftTypes.push("idle");
    details.idleDays = idleDrift.days;
  }

  // 2. Check misalignment drift (low alignment scores)
  const misalignmentDrift = await detectMisalignmentDrift();
  if (misalignmentDrift.isDrifting) {
    driftTypes.push("misalignment");
    details.lowAlignmentReviews = misalignmentDrift.count;
  }

  // 3. Check quality drift (repeatedly low quality)
  const qualityDrift = await detectQualityDrift();
  if (qualityDrift.isDrifting) {
    driftTypes.push("quality");
    details.lowQualityReviews = qualityDrift.count;
  }

  return {
    isDrifting: driftTypes.length > 0,
    driftTypes,
    details,
  };
}

/**
 * Idle Drift: No commits for N consecutive days
 */
async function detectIdleDrift(): Promise<{
  isDrifting: boolean;
  days: number;
}> {
  try {
    // Get consecutive idle days
    const result = await pool.query(
      `SELECT COUNT(*) as idle_days
       FROM daily_activity
       WHERE date >= CURRENT_DATE - INTERVAL '${IDLE_THRESHOLD_DAYS + 1} days'
       AND status = 'idle'`,
    );

    const idleDays = parseInt(result.rows[0]?.idle_days || "0");
    const isDrifting = idleDays >= IDLE_THRESHOLD_DAYS;

    if (isDrifting) {
      await recordDriftEvent(
        "idle",
        `No commits for ${idleDays} consecutive days`,
      );
    }

    return { isDrifting, days: idleDays };
  } catch (error) {
    console.error("Idle drift detection failed:", error);
    return { isDrifting: false, days: 0 };
  }
}

/**
 * Misalignment Drift: alignment_score < threshold for recent reviews
 */
async function detectMisalignmentDrift(): Promise<{
  isDrifting: boolean;
  count: number;
}> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as low_alignment_count
       FROM (
         SELECT (llm_output_json->>'alignment_score')::float as score
         FROM reviews
         ORDER BY created_at DESC
         LIMIT $1
       ) recent_reviews
       WHERE score < $2`,
      [MISALIGNMENT_COUNT, MISALIGNMENT_THRESHOLD],
    );

    const lowAlignmentCount = parseInt(
      result.rows[0]?.low_alignment_count || "0",
    );
    const isDrifting = lowAlignmentCount >= MISALIGNMENT_COUNT;

    if (isDrifting) {
      await recordDriftEvent(
        "misalignment",
        `${lowAlignmentCount} of last ${MISALIGNMENT_COUNT} reviews below alignment threshold (${MISALIGNMENT_THRESHOLD})`,
      );
    }

    return { isDrifting, count: lowAlignmentCount };
  } catch (error) {
    console.error("Misalignment drift detection failed:", error);
    return { isDrifting: false, count: 0 };
  }
}

/**
 * Quality Drift: execution_quality = "low" repeatedly
 */
async function detectQualityDrift(): Promise<{
  isDrifting: boolean;
  count: number;
}> {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as low_quality_count
       FROM (
         SELECT llm_output_json->>'execution_quality' as quality
         FROM reviews
         ORDER BY created_at DESC
         LIMIT $1
       ) recent_reviews
       WHERE quality = 'low'`,
      [LOW_QUALITY_COUNT],
    );

    const lowQualityCount = parseInt(result.rows[0]?.low_quality_count || "0");
    const isDrifting = lowQualityCount >= LOW_QUALITY_COUNT;

    if (isDrifting) {
      await recordDriftEvent(
        "quality",
        `${lowQualityCount} of last ${LOW_QUALITY_COUNT} reviews marked as low quality`,
      );
    }

    return { isDrifting, count: lowQualityCount };
  } catch (error) {
    console.error("Quality drift detection failed:", error);
    return { isDrifting: false, count: 0 };
  }
}

/**
 * Record a drift event (only if not already recorded today)
 */
async function recordDriftEvent(
  type: string,
  description: string,
): Promise<void> {
  try {
    // Check if this drift type was already recorded today
    const existing = await pool.query(
      `SELECT id FROM drift_events 
       WHERE type = $1 
       AND DATE(timestamp) = CURRENT_DATE 
       AND resolved = FALSE`,
      [type],
    );

    if (existing.rows.length === 0) {
      await pool.query(
        "INSERT INTO drift_events (type, description) VALUES ($1, $2)",
        [type, description],
      );
      console.log(`Drift event recorded: ${type} - ${description}`);
    }
  } catch (error) {
    console.error("Failed to record drift event:", error);
  }
}

/**
 * Get active (unresolved) drift events
 */
export async function getActiveDriftEvents(): Promise<any[]> {
  try {
    const result = await pool.query(
      `SELECT * FROM drift_events 
       WHERE resolved = FALSE 
       ORDER BY timestamp DESC`,
    );

    return result.rows;
  } catch (error) {
    console.error("Failed to get active drift events:", error);
    return [];
  }
}

/**
 * Mark drift events as resolved
 */
export async function resolveDriftEvents(type?: string): Promise<void> {
  try {
    if (type) {
      await pool.query(
        "UPDATE drift_events SET resolved = TRUE WHERE type = $1 AND resolved = FALSE",
        [type],
      );
    } else {
      await pool.query(
        "UPDATE drift_events SET resolved = TRUE WHERE resolved = FALSE",
      );
    }
  } catch (error) {
    console.error("Failed to resolve drift events:", error);
  }
}
