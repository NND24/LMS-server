import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { generateLast12MonthsData } from "../utils/analytics.generator";
import userModel from "../models/user.model";
import courseModel from "../models/course.model";
import orderModel from "../models/order.model";

export const getUsersAnalytics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await generateLast12MonthsData(userModel);

    res.status(200).json({
      success: true,
      users,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const getCoursesAnalytics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courses = await generateLast12MonthsData(courseModel);

    res.status(200).json({
      success: true,
      courses,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const getOrdersAnalytics = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await generateLast12MonthsData(orderModel);

    res.status(200).json({
      success: true,
      orders,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
