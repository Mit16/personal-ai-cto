import { Request, Response } from "express";
import { getLatestReview, reviewCommit } from "../services/review.js";

export const triggerReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const commitId = parseInt(req.params.commitId);

    if (isNaN(commitId)) {
      res.status(400).json({ error: "Invalid commit ID" });
      return;
    }

    const review = await reviewCommit(commitId);

    res.json({
      message: "Review completed",
      provider: review.llm_provider,
      review: review.llm_output_json,
    });
  } catch (error) {
    console.error("Review failed:", error);
    res.status(500).json({ error: "Review failed" });
  }
};

export const fetchLatestReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const review = await getLatestReview();

    if (!review) {
      res.status(404).json({ error: "No reviews found" });
      return;
    }

    res.json({
      commit_hash: review.hash,
      commit_timestamp: review.timestamp,
      provider: review.llm_provider,
      review: review.llm_output_json,
      reviewed_at: review.created_at,
    });
  } catch (error) {
    console.error("Failed to fetch review:", error);
    res.status(500).json({ error: "Unable to fetch review" });
  }
};