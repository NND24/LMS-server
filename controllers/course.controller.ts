import { Request, Response, NextFunction } from "express";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import ErrorHandler from "../utils/ErrorHandler";
import cloudinary from "cloudinary";
import { createCourse, getAllCoursesService } from "../services/course.service";
import courseModel from "../models/course.model";
import { redis } from "../utils/redis";
import mongoose from "mongoose";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendEmail";
import notificationModel from "../models/notification.model";

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

      await redis.set(courseId, JSON.stringify(course), "EX", 604800);

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

interface AddQuestionData {
  question: string;
  courseId: string;
  contentId: string;
}

export const addQuestion = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, courseId, contentId } = req.body as AddQuestionData;
    const course = await courseModel.findById(courseId);

    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return next(new ErrorHandler("Invalid content id", 400));
    }

    const courseContent = course?.courseData?.find((item: any) => item._id.equals(contentId));

    if (!courseContent) {
      return next(new ErrorHandler("Invalid content id", 400));
    }

    const newQuestion: any = {
      user: req.user,
      question,
      questionReplies: [],
    };

    courseContent.questions.push(newQuestion);

    await notificationModel.create({
      user: req.user._id,
      title: "New question received",
      message: `You have a new question in ${courseContent?.title}`,
    });

    await course.save();

    res.status(200).json({
      success: true,
      course,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface AddAnswerData {
  answer: string;
  courseId: string;
  contentId: string;
  questionId: string;
}

export const addAnswer = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { answer, courseId, contentId, questionId } = req.body as AddAnswerData;
    const course = await courseModel.findById(courseId);

    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return next(new ErrorHandler("Invalid content id", 400));
    }

    const courseContent = course?.courseData?.find((item: any) => item._id.equals(contentId));

    if (!courseContent) {
      return next(new ErrorHandler("Invalid content id", 400));
    }

    const question = courseContent?.questions?.find((item: any) => item._id.equals(questionId));

    if (!question) {
      return next(new ErrorHandler("Invalid question id", 400));
    }

    const newAnswer: any = {
      user: req?.user,
      answer,
    };

    question.questionReplies.push(newAnswer);

    await course.save();

    if (req.user?._id === question.user._id) {
      await notificationModel.create({
        user: req.user._id,
        title: "New question reply received",
        message: `You have a new question reply in ${courseContent?.title}`,
      });
    } else {
      const data = {
        name: question.user.name,
        title: courseContent.title,
      };

      const html = await ejs.render(path.join(__dirname, "../mails/question-reply.ejs"), data);

      try {
        await sendEmail({
          email: question.user.email,
          subject: "Question Reply",
          template: "question-reply.ejs",
          data,
        });
      } catch (error) {
        return next(new ErrorHandler(error.message, 400));
      }
    }

    res.status(200).json({
      success: true,
      course,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface AddReviewData {
  review: string;
  courseId: string;
  rating: string;
  userId: string;
}

export const addReview = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userCourseList = req.user?.courses;

    const courseId = req.params.id;

    const courseExist = userCourseList.find((course: any) => course._id.toString() === courseId.toString());

    if (!courseExist) {
      return next(new ErrorHandler("You are not eligible to access this course", 404));
    }

    const course = await courseModel.findById(courseId);

    const { review, rating } = req.body as AddReviewData;

    const reviewData: any = {
      user: req.user,
      rating,
      comment: review,
    };

    course?.reviews.push(reviewData);

    let avg = 0;

    course?.reviews.forEach((rev: any) => {
      avg += rev.rating;
    });

    if (course) {
      course.ratings = avg / course.reviews.length;
    }

    await course?.save();

    const noti = {
      title: "New review received",
      message: `${req.user.name} has given in ${course?.name}`,
    };

    res.status(200).json({
      success: true,
      course,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface AddReplyReviewData {
  comment: string;
  courseId: string;
  reviewId: string;
}

export const addReplyReview = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { comment, courseId, reviewId } = req.body as AddReplyReviewData;

    const course = await courseModel.findById(courseId);

    if (!course) {
      return next(new ErrorHandler("Course not found", 404));
    }

    const review = course?.reviews?.find((rev: any) => rev._id.toString() === reviewId);

    if (!review) {
      return next(new ErrorHandler("Review not found", 404));
    }

    const replyData: any = {
      user: req.user,
      comment,
    };

    if (!review.commentReplies) {
      review.commentReplies = [];
    }

    review.commentReplies.push(replyData);

    await course.save();

    res.status(200).json({
      success: true,
      course,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getAllCoursesAdmin = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    getAllCoursesService(res);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const deleteCourse = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const course = await courseModel.findById(id);

    if (!course) {
      return next(new ErrorHandler("Course not found", 404));
    }

    await course.deleteOne({ id });
    await redis.del(id);

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
