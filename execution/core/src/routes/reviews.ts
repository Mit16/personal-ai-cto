import { Router } from "express";
import { triggerReview, fetchLatestReview } from "../controllers/reviews.js";

const reviewsRouter = Router();

reviewsRouter.post("/commit/:commitId", triggerReview);
reviewsRouter.get("/latest", fetchLatestReview);

export default reviewsRouter;