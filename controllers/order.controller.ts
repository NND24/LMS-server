import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import { Order } from "../models/order.model";
import userModel from "../models/user.model";
import courseModel, { Course } from "../models/course.model";
import { getAllOrdersService, newOrder } from "../services/order.service";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendEmail";
import notificationModel from "../models/notification.model";
import { redis } from "../utils/redis";
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

export const createOrder = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { courseId, payment_info } = req.body as { courseId: string; payment_info: { id: string } };

    if (payment_info) {
      if ("id" in payment_info) {
        const paymentIntentId = payment_info.id;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== "succeeded") {
          return next(new ErrorHandler("Payment not authorized!", 400));
        }
      }
    }

    const user = await userModel.findById(req.user?._id);

    const courseExistInUser = user?.courses.some((course: any) => course._id.toString() === courseId);

    if (courseExistInUser) {
      return next(new ErrorHandler("You have already purchased this course", 400));
    }

    const course: Course = await courseModel.findById(courseId);

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

    user?.courses.push(course?._id);

    await redis.set(req.user?._id, JSON.stringify(user));

    await user.save();

    await notificationModel.create({
      user: user?._id,
      title: "New order",
      message: `You have a new order from ${course?.name}`,
    });

    course.purchased = course.purchased + 1;

    await course.save();

    newOrder(data, res, next);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const getAllOrders = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    getAllOrdersService(res);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const sendStripePublishableKey = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  res.status(200).json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

export const newPayment = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const myPayment = await stripe.paymentIntents.create({
      amount: req.body.amount,
      currency: "USD",
      metadata: {
        company: "E-Learning",
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(201).json({
      success: true,
      client_secret: myPayment.client_secret,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
