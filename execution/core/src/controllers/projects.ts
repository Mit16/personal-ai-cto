import { Request, Response } from "express";
import {pool} from "../db.js";

export const registerProject = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { repo_url, description } = req.body;

    if (!repo_url) {
      res.status(400).json({ error: "repo_url required" });
      return;
    }

    const result = await pool.query(
      "INSERT INTO projects (repo_url, description) VALUES ($1, $2) RETURNING *",
      [repo_url, description || null],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Project registration failed:", error);
    res.status(500).json({ error: "Unable to register project" });
  }
};

export const getProjects = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const result = await pool.query(
      "SELECT id, repo_url, description, created_at FROM projects ORDER BY created_at DESC",
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Project fetch failed:", error);
    res.status(500).json({ error: "Unable to get projects" });
  }
};
