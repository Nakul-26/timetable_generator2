import { Router } from 'express';
import auth from '../middleware/auth.js';

import authRoutes from './api/auth.js';
import facultyRoutes from './api/faculty.js';
import subjectRoutes from './api/subject.js';
import classRoutes from './api/class.js';
import teacherSubjectRoutes from './api/teacherSubject.js';
import classSubjectRoutes from './api/classSubject.js';
import timetableRoutes from './api/timetable.js';

const router = Router();
const protectedRouter = Router();
protectedRouter.use(auth);

// unprotected routes
router.use(authRoutes);

// protected routes
protectedRouter.use(facultyRoutes);
protectedRouter.use(subjectRoutes);
protectedRouter.use(classRoutes);
protectedRouter.use(teacherSubjectRoutes);
protectedRouter.use(classSubjectRoutes);
protectedRouter.use(timetableRoutes);

router.use(protectedRouter);

export default router;
