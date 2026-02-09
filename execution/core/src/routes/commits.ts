import { Router } from "express";
import { manualIngest, getCommitStats } from "../controllers/commits.js";

const commitsRouter = Router();

commitsRouter.post("/ingest/:projectId", manualIngest);
commitsRouter.get("/stats",getCommitStats);

export default commitsRouter;