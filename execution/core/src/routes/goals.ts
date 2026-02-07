// execution/core/src/routes/goal.ts
import { Router} from 'express';
import { addGoals, getGoals } from '../controllers/goals';

const goalsRouter = Router();

// Existing POST /goals
goalsRouter.post('/',addGoals);
goalsRouter.get('/',getGoals);

export default goalsRouter;