"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToken = exports.refreshTokenOptions = exports.accessTokenOptions = void 0;
require("dotenv").config();
const user_model_1 = __importDefault(require("../models/user.model"));
const accessTokenExpire = parseInt(process.env.ACCESS_TOKEN_EXPIRE || "5", 10);
const refreshTokenExpire = parseInt(process.env.REFRESH_TOKEN_EXPIRE || "30", 10);
exports.accessTokenOptions = {
    expires: new Date(Date.now() + accessTokenExpire * 60 * 60 * 1000),
    maxAge: accessTokenExpire * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "none",
    secure: true,
};
exports.refreshTokenOptions = {
    expires: new Date(Date.now() + refreshTokenExpire * 24 * 60 * 60 * 1000),
    maxAge: refreshTokenExpire * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "none",
    secure: true,
};
const sendToken = async (user, statusCode, req, res) => {
    const cookies = req.cookies;
    const accessToken = user.SignAccessToken();
    const newRefreshToken = user.SignRefreshToken();
    let newRefreshTokenArray = !cookies?.jwt ? user.refreshToken : user.refreshToken.filter((rt) => rt !== cookies.jwt);
    if (cookies?.jwt) {
        const refreshToken = cookies.jwt;
        const foundToken = await user_model_1.default.findOne({ refreshToken }).exec();
        if (!foundToken) {
            newRefreshTokenArray = [];
        }
        res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
    }
    user.refreshToken = [...newRefreshTokenArray, newRefreshToken];
    await user.save();
    res.cookie("jwt", newRefreshToken, exports.refreshTokenOptions);
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
exports.sendToken = sendToken;
