require("dotenv").config();
import { Request, Response } from "express";
import userModel, { User } from "../models/user.model";

interface TokenOptions {
  expires: Date;
  maxAge: number;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none" | undefined;
  secure?: boolean;
}

const accessTokenExpire = parseInt(process.env.ACCESS_TOKEN_EXPIRE || "5", 10);
const refreshTokenExpire = parseInt(process.env.REFRESH_TOKEN_EXPIRE || "30", 10);

export const accessTokenOptions: TokenOptions = {
  expires: new Date(Date.now() + accessTokenExpire * 60 * 60 * 1000),
  maxAge: accessTokenExpire * 3 * 1000,
  httpOnly: true,
  sameSite: "none",
  secure: true,
};

export const refreshTokenOptions: TokenOptions = {
  expires: new Date(Date.now() + refreshTokenExpire * 24 * 60 * 60 * 1000),
  maxAge: refreshTokenExpire * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: "none",
  secure: true,
};

export const sendToken = async (user: User, statusCode: number, req: Request, res: Response) => {
  const cookies = req.cookies;

  const accessToken = user.SignAccessToken();
  const newRefreshToken = user.SignRefreshToken();

  let newRefreshTokenArray = !cookies?.jwt ? user.refreshToken : user.refreshToken.filter((rt) => rt !== cookies.jwt);

  if (cookies?.jwt) {
    const refreshToken = cookies.jwt;
    const foundToken = await userModel.findOne({ refreshToken }).exec();

    if (!foundToken) {
      newRefreshTokenArray = [];
    }

    res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
  }

  user.refreshToken = [...newRefreshTokenArray, newRefreshToken];
  await user.save();

  res.cookie("jwt", newRefreshToken, refreshTokenOptions);

  res.status(statusCode).json({
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
};
