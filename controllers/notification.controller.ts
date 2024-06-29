import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import notificationModel from "../models/notification.model";
import cron from "node-cron";

export const getNotifications = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await notificationModel.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const updateNotification = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await notificationModel.findById(req.params.id);

    if (!notification) {
      return next(new ErrorHandler("Notification not found", 404));
    } else {
      notification.status ? (notification.status = "read") : notification?.status;
    }

    await notification.save();

    const notifications = await notificationModel.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

cron.schedule("0 0 0 * * *", async () => {
  const thirtyDayAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await notificationModel.deleteMany({ status: "read", createdAt: { $lt: thirtyDayAgo } });
});
