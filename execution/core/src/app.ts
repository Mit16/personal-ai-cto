// execution/core/src/app.ts
import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import goalsRouter from "./routes/goals";

const app = express();

app.use(cors());
app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));

app.use("/goals", goalsRouter);

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

export default app;
