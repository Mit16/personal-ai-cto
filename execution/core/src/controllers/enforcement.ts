import { Request, Response } from "express";
import { pool } from "../db.js";
import {
  detectDrift,
  updateDailyActivity,
  getActiveDriftEvents,
} from "../services/drift.js";
import {
  runDailyEnforcement,
  shouldRunEnforcement,
} from "../services/enforcement.js";

export const checkDrift = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    // Update today's activity first
    await updateDailyActivity();

    // Detect drift
    const driftStatus = await detectDrift();

    // Get active drift events
    const activeEvents = await getActiveDriftEvents();

    res.json({
      is_drifting: driftStatus.isDrifting,
      drift_types: driftStatus.driftTypes,
      details: driftStatus.details,
      active_events: activeEvents,
    });
  } catch (error) {
    console.error("Drift check failed:", error);
    res.status(500).json({ error: "Drift check failed" });
  }
};

export const getDailyActivity = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    const result = await pool.query(
      `SELECT date, commit_count, status 
       FROM daily_activity 
       ORDER BY date DESC 
       LIMIT $1`,
      [days],
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch daily activity:", error);
    res.status(500).json({ error: "Unable to fetch daily activity" });
  }
};

export const triggerEnforcement = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const canRun = await shouldRunEnforcement();

    if (!canRun) {
      res.json({
        message: "Enforcement already ran today",
        ran: false,
      });
      return;
    }

    // Run enforcement
    await runDailyEnforcement();

    res.json({
      message: "Enforcement complete",
      ran: true,
    });
  } catch (error) {
    console.error("Enforcement trigger failed:", error);
    res.status(500).json({ error: "Enforcement failed" });
  }
};
