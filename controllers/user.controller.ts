require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import userModel, { User } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import jwt, { Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendEmail";

interface RegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export const registrationUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;

    const isEmailExist = await userModel.findOne({ email });
    if (isEmailExist) {
      return next(new ErrorHandler("Email already exist!", 400));
    }

    const user: RegistrationBody = {
      name,
      email,
      password,
    };

    const activationToken = createActivationToken(user);
    const activationCode = activationToken.activationCode;

    const data = { user: { name: user.name }, activationCode };
    const html = await ejs.renderFile(path.join(__dirname, "../mails/activation-mail.ejs"), data);

    try {
      await sendEmail({
        email: user.email,
        subject: "Activate your account",
        template: "activation-mail.ejs",
        data,
      });

      res.status(201).json({
        success: true,
        message: `Please check your email: ${user.email} to activate your account!`,
        activationToken: activationToken.token,
      });
    } catch (error: any) {
      return next(new ErrorHandler(error.message, 400));
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface ActivationToken {
  token: string;
  activationCode: string;
}

export const createActivationToken = (user: any): ActivationToken => {
  const activationCode = Math.floor(1000 + Math.random() * 9000).toString();

  const token = jwt.sign(
    {
      user,
      activationCode,
    },
    process.env.ACTIVATION_SECRET as Secret,
    {
      expiresIn: "5m",
    }
  );

  return { token, activationCode };
};

interface ActivationRequest {
  activation_token: string;
  activation_code: string;
}

export const activateUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { activation_token, activation_code } = req.body as ActivationRequest;

    const newUser: { user: User; activationCode: string } = jwt.verify(
      activation_token,
      process.env.ACTIVATION_SECRET as string
    ) as { user: User; activationCode: string };

    if (newUser.activationCode !== activation_code) {
      return next(new ErrorHandler("Invalid activation code", 400));
    }

    const { name, email, password } = newUser.user;

    const isExistedUser = await userModel.findOne({ email });

    if (isExistedUser) {
      return next(new ErrorHandler("Email already exist", 400));
    }

    const user = await userModel.create({
      name,
      email,
      password,
    });

    res.status(201).json({
      success: true,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});
