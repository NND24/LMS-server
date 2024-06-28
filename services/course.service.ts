import { Response } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import courseModel from "../models/course.model";

export const createCourse = CatchAsyncError(async (data: any, res: Response) => {
  const course = await courseModel.create(data);
  res.status(201).json({
    success: true,
    course,
  });
});
