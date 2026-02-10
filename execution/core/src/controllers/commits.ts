// execution\core\src\controllers\commits.ts
import { Request, Response } from "express";
import { ingestCommits } from "../services/git.js";
import {pool} from "../db.js";

export const manualIngest = async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = parseInt(req.params.projectId);

    if (isNaN(projectId)) {
      res.status(400).json({ error: "Invalid project ID" });
      return;
    }

    const count = await ingestCommits(projectId);

    res.json({ 
      message: `Ingested ${count} commits`,
      project_id: projectId,
      commits_ingested: count
    });
  } catch (error) {
    console.error("Manual ingestion failed:", error);
    res.status(500).json({ error: "Ingestion failed" });
  }
};

export const getCommitStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Commits today
    const todayResult = await pool.query(
      "SELECT COUNT(*) FROM commits WHERE timestamp >= $1",
      [todayStart]
    );

    // Commits last 7 days
    const weekResult = await pool.query(
      "SELECT COUNT(*) FROM commits WHERE timestamp >= $1",
      [sevenDaysAgo]
    );

    // Active goals
    const goalsResult = await pool.query(
      "SELECT COUNT(*) FROM goals WHERE active = true"
    );

    res.json({
      commits_today: parseInt(todayResult.rows[0].count),
      commits_last_7_days: parseInt(weekResult.rows[0].count),
      active_goals: parseInt(goalsResult.rows[0].count),
    });
  } catch (error) {
    console.error("Stats fetch failed:", error);
    res.status(500).json({ error: "Unable to get stats" });
  }
};