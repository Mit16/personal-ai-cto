import { Router } from "express";
import { getProjects, registerProject } from "../controllers/projects.js";

const projectsRouter = Router();

projectsRouter.post("/", registerProject);
projectsRouter.get("/", getProjects);

export default projectsRouter;