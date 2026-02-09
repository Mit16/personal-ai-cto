// execution/core/src/controllers/goal.ts
import { Request, Response } from "express";
import {pool} from "../db.js";

export const addGoals = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description } = req.body;

    if (!title) {
      res.status(400).json({ error: "Title required" });
      return;
    }

    const result = await pool.query(
      "INSERT INTO goals (title, description) VALUES ($1, $2) RETURNING *",
      [title, description || null],
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Goal creation failed:", error);
    res.status(500).json({ error: "Unable to add goals" });
  }
};

export const getGoals = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      "SELECT id, title, description, created_at FROM goals WHERE active = true ORDER BY created_at DESC",
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Goal fetch failed:", error);
    res.status(500).json({ error: "Unable to get goals" });
  }
};
