require("dotenv").config();
import { Request, Response, NextFunction } from "express";
import userModel, { User } from "../models/user.model";
import ErrorHandler from "../utils/ErrorHandler";
import { CatchAsyncError } from "../middlewares/catchAsyncError";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import ejs from "ejs";
import path from "path";
import sendEmail from "../utils/sendEmail";
import { accessTokenOptions, refreshTokenOptions, sendToken } from "../utils/jwt";
import { redis } from "../utils/redis";
import { getAllUsersService, getUserId, updateUserRoleService } from "../services/user.service";
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

    sendToken(user, 200, res);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const logoutUser = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.cookie("access_token", "", { maxAge: 1 });
    res.cookie("refresh_token", "", { maxAge: 1 });

    const userId = req.user?._id || "";
    redis.del(userId);

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
    const refresh_token = req.cookies.refresh_token as string;
    const decoded = jwt.verify(refresh_token, process.env.REFRESH_TOKEN as string) as JwtPayload;

    if (!decoded) {
      return next(new ErrorHandler("Could not refresh token", 400));
    }

    const session = await redis.get(decoded.id as string);

    if (!session) {
      return next(new ErrorHandler("Please login to access this resource", 400));
    }

    const user = JSON.parse(session);

    const accessToken = jwt.sign({ id: user._id }, process.env.ACCESS_TOKEN as string, {
      expiresIn: "5m",
    });

    const refreshToken = jwt.sign({ id: user._id }, process.env.REFRESH_TOKEN as string, {
      expiresIn: "3d",
    });

    req.user = user;

    res.cookie("access_token", accessToken, accessTokenOptions);
    res.cookie("refresh_token", refreshToken, refreshTokenOptions);

    await redis.set(user._id, JSON.stringify(user), "EX", 604800);

    res.status(200).json({
      status: "success",
      accessToken,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getUserInfo = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?._id;
    getUserId(userId, res);
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
      sendToken(newUser, 200, res);
    } else {
      sendToken(user, 200, res);
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
    const { email, name } = req.body as UpdateUserInfo;
    const userId = req.user?._id;
    const user = await userModel?.findById(userId);

    if (email && user) {
      const isEmailExisted = await userModel.find({ email });
      if (isEmailExisted) {
        return next(new ErrorHandler("Email already exist", 400));
      }
      user.email = email;
    }

    if (name && user) {
      user.name = name;
    }

    await user?.save();
    await redis.set(userId, JSON.stringify(user));

    res.status(201).json({
      success: true,
      user,
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
    await redis.set(req.user?._id, JSON.stringify(user));

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
    const userId = req.user._id;
    const user = await userModel.findById(userId);

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
    await redis.set(userId, JSON.stringify(user));

    res.status(201).json({
      success: true,
      user,
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 400));
  }
});

export const getAllUsers = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    getAllUsersService(res);
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});

export const updateUserRole = CatchAsyncError(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id, role } = req.body;
    updateUserRoleService(id, role, res);
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
    await redis.del(id);

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error: any) {
    return next(new ErrorHandler(error.message, 500));
  }
});
