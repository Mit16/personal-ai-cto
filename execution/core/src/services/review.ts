import { pool } from "../db.js";
import { reviewCode, getCurrentProvider } from "./llm.js";
import { getCommitDiff } from "./git.js";

export async function reviewCommit(commitId: number): Promise<any> {
  try {
    // Get commit details
    const commitResult = await pool.query(
      `SELECT c.*, p.id as project_id 
       FROM commits c 
       JOIN projects p ON c.project_id = p.id 
       WHERE c.id = $1`,
      [commitId],
    );

    if (commitResult.rows.length === 0) {
      throw new Error(`Commit ${commitId} not found`);
    }

    const commit = commitResult.rows[0];

    // Get active goals
    const goalsResult = await pool.query(
      "SELECT title, description FROM goals WHERE active = true",
    );

    // Get diff
    const diff = await getCommitDiff(commit.project_id, commit.hash);

    // Request LLM review
    const review = await reviewCode({
      diff,
      commitMessage: commit.message || commit.hash.substring(0, 7),
      activeGoals: goalsResult.rows,
      filesChanged: commit.files_changed,
      linesAdded: commit.lines_added,
      linesRemoved: commit.lines_removed,
    });

    // Store review with provider info
    const provider = getCurrentProvider();
    const reviewResult = await pool.query(
      "INSERT INTO reviews (commit_id, llm_provider, llm_output_json) VALUES ($1, $2, $3) RETURNING *",
      [commitId, provider, JSON.stringify(review)],
    );

    return reviewResult.rows[0];
  } catch (error) {
    console.error(`Failed to review commit ${commitId}:`, error);
    throw error;
  }
}

export async function getLatestReview(): Promise<any> {
  try {
    const result = await pool.query(
      `SELECT r.*, c.hash, c.timestamp 
       FROM reviews r 
       JOIN commits c ON r.commit_id = c.id 
       ORDER BY r.created_at DESC 
       LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error("Failed to get latest review:", error);
    throw error;
  }
}
