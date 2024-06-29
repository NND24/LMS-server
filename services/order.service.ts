import { NextFunction, Response } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import orderModel from "../models/order.model";

export const newOrder = CatchAsyncError(async (data: any, res: Response, next: NextFunction) => {
  const order = await orderModel.create(data);

  res.status(201).json({
    success: true,
    order,
  });
});

export const getAllOrdersService = async (res: Response) => {
  const orders = await orderModel.find().sort({ createdAt: -1 });

  res.status(201).json({
    success: true,
    orders,
  });
};
