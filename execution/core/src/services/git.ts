// execution\core\src\services\git.ts
import simpleGit, { SimpleGit, LogResult } from "simple-git";
import { pool } from "../db.js";
import fs from "fs";
import path from "path";

const REPOS_DIR = path.join(process.cwd(), ".repos");

// Ensure repos directly exists
if (!fs.existsSync(REPOS_DIR)) {
  fs.mkdirSync(REPOS_DIR, { recursive: true });
}

interface CommitData {
  hash: string;
  timestamp: Date;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  message: string;
}

export async function ingestCommits(projectId: number): Promise<number> {
  try {
    // Get project details
    const projectResult = await pool.query(
      "SELECT repo_url FROM projects WHERE id = $1",
      [projectId],
    );

    if (projectResult.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    const repoUrl = projectResult.rows[0].repo_url;
    const repoName =
      repoUrl.split("/").pop()?.replace(".git", "") || `project-${projectId}`;
    const repoPath = path.join(REPOS_DIR, repoName);

    let git: SimpleGit;

    // Clone or pull repo
    if (fs.existsSync(repoPath)) {
      git = simpleGit(repoPath);
      // REPLACE "await git.pull();" WITH THIS:
      await git.fetch();
      await git.reset(["--hard", "origin/HEAD"]);
    } else {
      git = simpleGit();
      await git.clone(repoUrl, repoPath);
      git = simpleGit(repoPath);
    }

    // Get last stored commit hash
    const lastCommitResult = await pool.query(
      "SELECT hash FROM commits WHERE project_id = $1 ORDER BY timestamp DESC LIMIT 1",
      [projectId],
    );

    const lastHash = lastCommitResult.rows[0]?.hash;

    // Get new commits
    const logOptions = lastHash ? { from: lastHash, to: "HEAD" } : {};
    const log: LogResult = await git.log(logOptions);

    let newCommitsCount = 0;

    for (const commit of log.all) {
      // Skip if we already have this commit
      if (commit.hash === lastHash) continue;

      let commitData: CommitData;

      try {
        // Try to get diff stats (this will fail for the first commit with no parent)
        const diff = await git.diffSummary([`${commit.hash}^`, commit.hash]);

        commitData = {
          hash: commit.hash,
          timestamp: new Date(commit.date),
          filesChanged: diff.files.length,
          linesAdded: diff.insertions,
          linesRemoved: diff.deletions,
          message: commit.message,
        };
      } catch (diffError) {
        // For the first commit (no parent), get stats differently
        console.log(
          `First commit detected: ${commit.hash.substring(0, 7)}, using alternative stats`,
        );

        const show = await git.show([commit.hash, "--stat", "--format="]);

        // Parse the stat output to count changes
        const lines = show.split("\n").filter((line) => line.trim());
        const statsLine = lines[lines.length - 1];

        // Try to extract numbers from " X files changed, Y insertions(+), Z deletions(-)"
        let filesChanged = 0;
        let linesAdded = 0;
        let linesRemoved = 0;

        const filesMatch = statsLine.match(/(\d+) files? changed/);
        const insertMatch = statsLine.match(/(\d+) insertions?\(\+\)/);
        const deleteMatch = statsLine.match(/(\d+) deletions?\(-\)/);

        if (filesMatch) filesChanged = parseInt(filesMatch[1]);
        if (insertMatch) linesAdded = parseInt(insertMatch[1]);
        if (deleteMatch) linesRemoved = parseInt(deleteMatch[1]);

        commitData = {
          hash: commit.hash,
          timestamp: new Date(commit.date),
          filesChanged,
          linesAdded,
          linesRemoved,
          message: commit.message,
        };
      }

      // Store commit
      await pool.query(
        `INSERT INTO commits (hash, project_id, timestamp, files_changed, lines_added, lines_removed, message)
   VALUES ($1, $2, $3, $4, $5, $6, $7)
   ON CONFLICT (hash) DO NOTHING`,
        [
          commitData.hash,
          projectId,
          commitData.timestamp,
          commitData.filesChanged,
          commitData.linesAdded,
          commitData.linesRemoved,
          commitData.message,
        ],
      );

      newCommitsCount++;
    }

    console.log(
      `Ingested ${newCommitsCount} new commits for project ${projectId}`,
    );
    return newCommitsCount;
  } catch (error) {
    console.error(`Failed to ingest commits for project ${projectId}:`, error);
    throw error;
  }
}

export async function getCommitDiff(
  projectId: number,
  commitHash: string,
): Promise<string> {
  try {
    const projectResult = await pool.query(
      "SELECT repo_url FROM projects WHERE id = $1",
      [projectId],
    );

    if (projectResult.rows.length === 0) {
      throw new Error(`Project ${projectId} not found`);
    }

    const repoUrl = projectResult.rows[0].repo_url;
    const repoName =
      repoUrl.split("/").pop()?.replace(".git", "") || `project-${projectId}`;
    const repoPath = path.join(REPOS_DIR, repoName);

    if (!fs.existsSync(repoPath)) {
      throw new Error(`Repository not cloned yet`);
    }

    const git = simpleGit(repoPath);

    try {
      const diff = await git.diff([`${commitHash}^`, commitHash]);
      return diff;
    } catch (error) {
      // Handle first commit (no parent)
      const show = await git.show([commitHash]);
      return show;
    }
  } catch (error) {
    console.error(`Failed to get diff for commit ${commitHash}:`, error);
    throw error;
  }
}
