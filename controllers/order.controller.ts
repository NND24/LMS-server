import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { Order } from "../models/order.model";
import userModel from "../models/user.model";
import courseModel from "../models/course.model";
import { newOrder } from "../services/order.service";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendEmail";
import notificationModel from "../models/notification.model";

export const createOrder = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId, payment_info } = req.body as Order;

    const user = await userModel.findById(req.user?._id);

    const courseExistInUser = user?.courses.some((course: any) => course._id.toString() === courseId);

    if (courseExistInUser) {
      return next(new ErrorHandler("You have already purchased this course", 400));
    }

    const course = await courseModel.findById(courseId);

    if (!course) {
      return next(new ErrorHandler("Course not found", 404));
    }

    const data: any = {
      courseId: course._id,
      userId: user._id,
    };

    const mailData = {
      order: {
        _id: course._id.toString().slice(0, 6),
        name: course.name,
        price: course.price,
        date: new Date().toLocaleDateString("vi-VN", { year: "numeric", month: "long", day: "numeric" }),
      },
    };

    const html = await ejs.renderFile(path.join(__dirname, "../mails/order-confirmation.ejs"), { order: mailData });

    try {
      if (user) {
        await sendEmail({
          email: user.email,
          subject: "Order confirmation",
          template: "order-confirmation.ejs",
          data: mailData,
        });
      }
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 500));
    }

    user?.courses.push(course?.id);

    await user.save();

    await notificationModel.create({
      user: user?._id,
      title: "New order",
      message: `You have a new order from ${course?.name}`,
    });

    course.purchased ? (course.purchased += 1) : course.purchased;

    await course.save();

    newOrder(data, res, next);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
