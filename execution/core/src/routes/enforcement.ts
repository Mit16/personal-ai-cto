import { Router } from "express";
import {
  checkDrift,
  getDailyActivity,
  triggerEnforcement,
} from "../controllers/enforcement.js";

const enforcementRouter = Router();

enforcementRouter.get("/drift", checkDrift);
enforcementRouter.get("/activity", getDailyActivity);
enforcementRouter.post("/trigger", triggerEnforcement);

export default enforcementRouter;
