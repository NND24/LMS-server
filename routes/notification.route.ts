import express from "express";
import { authorizeRoles, isAuthenticated } from "../middlewares/auth";
import { getNotifications, updateNotification } from "../controllers/notification.controller";
import { updateAccessToken } from "../controllers/user.controller";

const notificationRouter = express.Router();

notificationRouter.get(
  "/get-all-notification",
  updateAccessToken,
  isAuthenticated,
  authorizeRoles("admin"),
  getNotifications
);
notificationRouter.put(
  "/update-notification",
  updateAccessToken,
  isAuthenticated,
  authorizeRoles("admin"),
  updateNotification
);

export default notificationRouter;
