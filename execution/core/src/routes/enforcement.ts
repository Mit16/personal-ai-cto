import { Router } from "express";
import { checkDrift, getDailyActivity } from "../controllers/enforcement.js";

const enforcementRouter = Router();

enforcementRouter.get("/drift", checkDrift);
enforcementRouter.get("/activity", getDailyActivity);

export default enforcementRouter;
