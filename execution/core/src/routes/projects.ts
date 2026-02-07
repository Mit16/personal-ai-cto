import { Router } from "express";
import { getProjects, registerProject } from "../controllers/projects";

const projectsRouter = Router();

projectsRouter.post("/", registerProject);
projectsRouter.get("/", getProjects);

export default projectsRouter;