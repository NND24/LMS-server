import express from "express";
import { authorizeRoles, isAuthenticated } from "../middlewares/auth";
import { getNotifications, updateNotification } from "../controllers/notification.controller";

const notificationRouter = express.Router();

notificationRouter.get("/get-all-notification", isAuthenticated, authorizeRoles("admin"), getNotifications);
notificationRouter.put("/update-notification", isAuthenticated, authorizeRoles("admin"), updateNotification);

export default notificationRouter;
