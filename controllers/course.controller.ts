import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import cloudinary from "cloudinary";
import { createCourse } from "../services/course.service";
import courseModel from "../models/course.model";
import { redis } from "../utils/redis";

export const uploadCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;
    const thumbnail = data.thumbnail;

    if (thumbnail) {
      const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
        folder: "courses",
      });

      data.thumbnail = {
        public_id: myCloud.public_id,
        url: myCloud.url,
      };
    }

    createCourse(data, res, next);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const editCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = req.body;
    const thumbnail = data.thumbnail;

    if (thumbnail) {
      await cloudinary.v2.uploader.destroy(thumbnail.public_id);

      const myCloud = await cloudinary.v2.uploader.upload(thumbnail, {
        folder: "courses",
      });

      data.thumbnail = {
        public_id: myCloud.public_id,
        url: myCloud.url,
      };
    }

    const courseId = req.params.id;

    const course = await courseModel.findByIdAndUpdate(
      courseId,
      {
        $set: data,
      },
      {
        new: true,
      }
    );

    res.status(201).json({
      success: true,
      course,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getSingleCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const courseId = req.params.id;

    const isCacheExist = await redis.get(courseId);

    if (isCacheExist) {
      const course = JSON.parse(isCacheExist);
      res.status(200).json({
        success: true,
        course,
      });
    } else {
      const course = await courseModel
        .findById(req.params.id)
        .select("-courseData.videoUrl -courseData.suggestion -courseData.question -courseData.links");

      await redis.set(courseId, JSON.stringify(course));

      res.status(200).json({
        success: true,
        course,
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getAllCourses = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const isCacheExist = await redis.get("allCourses");

    if (isCacheExist) {
      const courses = JSON.parse(isCacheExist);
      res.status(200).json({
        success: true,
        courses,
      });
    } else {
      const courses = await courseModel
        .find()
        .select("-courseData.videoUrl -courseData.suggestion -courseData.question -courseData.links");

      await redis.set("allCourses", JSON.stringify(courses));

      res.status(200).json({
        success: true,
        courses,
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getCourseByUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userCourseList = req.user?.courses;
    const courseId = req.params.id;

    const courseExist = userCourseList?.find((course: any) => course._id.toString() === courseId);

    if (!courseExist) {
      return next(new ErrorHandler("You are not eligible to access this course", 404));
    }

    const course = await courseModel.findById(courseId);

    const content = course?.courseData;

    res.status(200).json({
      success: true,
      content,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});
