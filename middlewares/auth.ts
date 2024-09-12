import ErrorHandler from "../utils/ErrorHandler";
import jwt, { JwtPayload } from "jsonwebtoken";
import { CatchAsyncError } from "./catchAsyncError";
import { NextFunction, Request, Response } from "express";
import userModel from "../models/user.model";

export const isAuthenticated = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || (req.headers.Authorization as string);

  if (!authHeader?.startsWith("Bearer ")) {
    return next(new ErrorHandler("Unauthorized: No token provided", 401));
  }

  const token = authHeader.split(" ")[1];
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN as string, async (err, decoded: any) => {
      if (err) {
        console.log(err);
        return next(new ErrorHandler("Forbidden: Invalid token", 403));
      }

      if (decoded?.id) {
        const user = await userModel.findById(decoded.id);
        if (user) {
          req.user = user;
          next();
        } else {
          return next(new ErrorHandler("User not found", 404));
        }
      } else {
        return next(new ErrorHandler("Invalid token payload", 403));
      }
    });
  } else {
    return next(new ErrorHandler("Token not provided", 401));
  }
});

export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role || "")) {
      return next(new ErrorHandler(`Role ${req.user?.role} is not allowed to access this resource`, 403));
    }
    next();
  };
};
