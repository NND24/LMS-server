import express from "express";
import { authorizeRoles, isAuthenticated } from "../middlewares/auth";
import { editCourse, uploadCourse } from "../controllers/course.controller";
const courseRouter = express.Router();

courseRouter.post("/create-course", isAuthenticated, authorizeRoles("admin"), uploadCourse);
courseRouter.post("/edit-course/:id", isAuthenticated, authorizeRoles("admin"), editCourse);

export default courseRouter;
