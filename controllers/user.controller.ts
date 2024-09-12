require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import userModel, { User } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import jwt, { Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendEmail";
import { sendToken } from "../utils/jwt";
import cloudinary from "cloudinary";

interface RegistrationBody {
  name: string;
  email: string;
  password: string;
  avatar?: string;
}

export const registrationUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password } = req.body;

    const isEmailExisted = await userModel.findOne({ email });
    if (isEmailExisted) {
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

    await userModel.create({
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

interface LoginRequest {
  email: string;
  password: string;
}

export const loginUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!email || !password) {
      return next(new ErrorHandler("Please enter your email and password", 400));
    }

    const user = await userModel.findOne({ email }).select("+password");

    if (!user) {
      return next(new ErrorHandler("Invalid email or password", 400));
    }

    const isCorrectPass = await user.comparedPassword(password);

    if (!isCorrectPass) {
      return next(new ErrorHandler("Invalid email or password", 400));
    }

    sendToken(user, 200, req, res);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const logoutUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) return res.sendStatus(204);
    const refreshToken = cookies.jwt;

    const foundUser = await userModel.findOne({ refreshToken: { $in: [refreshToken] } }).exec();
    if (!foundUser) {
      res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
      return res.sendStatus(204);
    }

    foundUser.refreshToken = foundUser.refreshToken.filter((rt) => rt !== refreshToken);
    await foundUser.save();

    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });

    res.status(200).json({
      success: true,
      message: "Logged out successfully!",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const updateAccessToken = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = req.cookies;
    if (!cookies?.jwt) {
      return next(new ErrorHandler("Unauthorized: No refresh token provided", 401));
    }

    const refreshToken = cookies.jwt;
    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });

    const foundUser = await userModel.findOne({ refreshToken: { $in: [refreshToken] } }).exec();

    if (!foundUser) {
      jwt.verify(refreshToken, process.env.REFRESH_TOKEN as string, async (err: any, decoded: any) => {
        if (err) {
          return next(new ErrorHandler("Forbidden: Invalid or expired refresh token", 403));
        }

        const user = await userModel.findById(decoded?.id).exec();
        if (user) {
          user.refreshToken = [];
          await user.save();
        }

        return next(new ErrorHandler("Forbidden: Possible token misuse detected", 403));
      });

      return next(new ErrorHandler("Forbidden: Refresh token not found", 403));
    }

    const newRefreshTokenArray = foundUser.refreshToken.filter((rt) => rt !== refreshToken);

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN as string, async (err: any, decoded: any) => {
      if (err) {
        foundUser.refreshToken = newRefreshTokenArray;
        await foundUser.save();
        return next(new ErrorHandler("Forbidden: Refresh token verification failed", 403));
      }

      if (foundUser._id.toString() !== decoded.id) {
        return next(new ErrorHandler("Forbidden: User mismatch", 403));
      }

      foundUser.refreshToken = newRefreshTokenArray;
      sendToken(foundUser, 200, req, res);
    });
  } catch (error: any) {
    return next(new ErrorHandler(`Internal Server Error: ${error.message}`, 500));
  }
});

export const getUserInfo = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;
    const user = await userModel.findById(userId);

    if (user) {
      res.status(201).json({
        success: true,
        user,
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface SocialAuthBody {
  email: string;
  name: string;
  avatar: string;
}

export const socialAuth = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, name, avatar } = req.body as SocialAuthBody;
    const user = await userModel.findOne({ email });
    if (!user) {
      const newUser = await userModel.create({ email, name, avatar });
      sendToken(newUser, 200, req, res);
    } else {
      sendToken(user, 200, req, res);
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface UpdateUserInfo {
  email?: string;
  name?: string;
}

export const updateUserInfo = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body as UpdateUserInfo;
    const userId = req.user?._id;
    const user = await userModel?.findById(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (name && user) {
      user.name = name;
    }

    await user?.save();

    const accessToken = user.SignAccessToken();

    res.status(201).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        courses: user.courses,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface UpdatePassword {
  oldPassword: string;
  newPassword: string;
}

export const updatePassword = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { oldPassword, newPassword } = req.body as UpdatePassword;

    if (!oldPassword || !newPassword) {
      return next(new ErrorHandler("Please enter old and new password", 400));
    }

    const user = await userModel.findById(req.user?._id).select("+password");

    if (user?.password === undefined) {
      return next(new ErrorHandler("Invalid user", 400));
    }

    const isCorrectPass = await user.comparedPassword(oldPassword);

    if (!isCorrectPass) {
      return next(new ErrorHandler("Invalid old password", 400));
    }

    user.password = newPassword;

    await user.save();

    res.status(201).json({
      success: true,
      user,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

interface UpdateAvatar {
  avatar: string;
}

export const updateAvatar = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { avatar } = req.body as UpdateAvatar;
    const userId = (req.user as User)._id;
    const user = await userModel.findById(userId);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    if (avatar && user) {
      if (user?.avatar?.public_id) {
        await cloudinary.v2.uploader.destroy(user?.avatar?.public_id);

        const myCloud = await cloudinary.v2.uploader.upload(avatar, {
          folder: "avatars",
          width: 150,
        });
        user.avatar = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      } else {
        const myCloud = await cloudinary.v2.uploader.upload(avatar, {
          folder: "avatars",
          width: 150,
        });
        user.avatar = {
          public_id: myCloud.public_id,
          url: myCloud.secure_url,
        };
      }
    }

    await user.save();

    const accessToken = user.SignAccessToken();

    res.status(201).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        courses: user.courses,
      },
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getAllUsers = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await userModel.find().sort({ createdAt: -1 });

    res.status(201).json({
      success: true,
      users,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const updateUserRole = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, role } = req.body;
    const isUserExist = await userModel.findOne({ email });
    if (isUserExist) {
      const id = isUserExist._id;
      const user = await userModel.findByIdAndUpdate(id, { role }, { new: true });

      if (!user) {
        return next(new ErrorHandler("User not found", 404));
      }

      const accessToken = user.SignAccessToken();

      res.status(201).json({
        success: true,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          courses: user.courses,
        },
        accessToken,
      });
    } else {
      res.status(400).json({
        success: "false",
        message: "User not found",
      });
    }
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const deleteUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const user = await userModel.findById(id);

    if (!user) {
      return next(new ErrorHandler("User not found", 404));
    }

    await user.deleteOne({ id });

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
