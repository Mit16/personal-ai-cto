import { Router } from "express";
import {
  checkDrift,
  getDailyActivity,
  getLatestSummary,
  triggerEnforcement,
  triggerWeeklySummary,
} from "../controllers/enforcement.js";

const enforcementRouter = Router();

enforcementRouter.get("/drift", checkDrift);
enforcementRouter.get("/activity", getDailyActivity);
enforcementRouter.post("/trigger", triggerEnforcement);
enforcementRouter.post("/weekly", triggerWeeklySummary);
enforcementRouter.get("/summary/latest", getLatestSummary);

export default enforcementRouter;
