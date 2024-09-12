"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUserRole = exports.getAllUsers = exports.updateAvatar = exports.updatePassword = exports.updateUserInfo = exports.socialAuth = exports.getUserInfo = exports.updateAccessToken = exports.logoutUser = exports.loginUser = exports.activateUser = exports.createActivationToken = exports.registrationUser = void 0;
require("dotenv").config();
const user_model_1 = __importDefault(require("../models/user.model"));
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const catchAsyncError_1 = require("../middlewares/catchAsyncError");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ejs_1 = __importDefault(require("ejs"));
const path_1 = __importDefault(require("path"));
const sendEmail_1 = __importDefault(require("../utils/sendEmail"));
const jwt_1 = require("../utils/jwt");
const cloudinary_1 = __importDefault(require("cloudinary"));
exports.registrationUser = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { name, email, password } = req.body;
        const isEmailExisted = await user_model_1.default.findOne({ email });
        if (isEmailExisted) {
            return next(new ErrorHandler_1.default("Email already exist!", 400));
        }
        const user = {
            name,
            email,
            password,
        };
        const activationToken = (0, exports.createActivationToken)(user);
        const activationCode = activationToken.activationCode;
        const data = { user: { name: user.name }, activationCode };
        const html = await ejs_1.default.renderFile(path_1.default.join(__dirname, "../mails/activation-mail.ejs"), data);
        try {
            await (0, sendEmail_1.default)({
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
        }
        catch (error) {
            return next(new ErrorHandler_1.default(error.message, 400));
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
const createActivationToken = (user) => {
    const activationCode = Math.floor(1000 + Math.random() * 9000).toString();
    const token = jsonwebtoken_1.default.sign({
        user,
        activationCode,
    }, process.env.ACTIVATION_SECRET, {
        expiresIn: "5m",
    });
    return { token, activationCode };
};
exports.createActivationToken = createActivationToken;
exports.activateUser = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { activation_token, activation_code } = req.body;
        const newUser = jsonwebtoken_1.default.verify(activation_token, process.env.ACTIVATION_SECRET);
        if (newUser.activationCode !== activation_code) {
            return next(new ErrorHandler_1.default("Invalid activation code", 400));
        }
        const { name, email, password } = newUser.user;
        const isExistedUser = await user_model_1.default.findOne({ email });
        if (isExistedUser) {
            return next(new ErrorHandler_1.default("Email already exist", 400));
        }
        await user_model_1.default.create({
            name,
            email,
            password,
        });
        res.status(201).json({
            success: true,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.loginUser = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return next(new ErrorHandler_1.default("Please enter your email and password", 400));
        }
        const user = await user_model_1.default.findOne({ email }).select("+password");
        if (!user) {
            return next(new ErrorHandler_1.default("Invalid email or password", 400));
        }
        const isCorrectPass = await user.comparedPassword(password);
        if (!isCorrectPass) {
            return next(new ErrorHandler_1.default("Invalid email or password", 400));
        }
        (0, jwt_1.sendToken)(user, 200, req, res);
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.logoutUser = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt)
            return res.sendStatus(204);
        const refreshToken = cookies.jwt;
        const foundUser = await user_model_1.default.findOne({ refreshToken: { $in: [refreshToken] } }).exec();
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
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updateAccessToken = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const cookies = req.cookies;
        if (!cookies?.jwt) {
            return next(new ErrorHandler_1.default("Unauthorized: No refresh token provided", 401));
        }
        const refreshToken = cookies.jwt;
        res.clearCookie("jwt", { httpOnly: true, sameSite: "none", secure: true });
        const foundUser = await user_model_1.default.findOne({ refreshToken: { $in: [refreshToken] } }).exec();
        if (!foundUser) {
            jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_TOKEN, async (err, decoded) => {
                if (err) {
                    return next(new ErrorHandler_1.default("Forbidden: Invalid or expired refresh token", 403));
                }
                const user = await user_model_1.default.findById(decoded?.id).exec();
                if (user) {
                    user.refreshToken = [];
                    await user.save();
                }
                return next(new ErrorHandler_1.default("Forbidden: Possible token misuse detected", 403));
            });
            return next(new ErrorHandler_1.default("Forbidden: Refresh token not found", 403));
        }
        const newRefreshTokenArray = foundUser.refreshToken.filter((rt) => rt !== refreshToken);
        jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_TOKEN, async (err, decoded) => {
            if (err) {
                foundUser.refreshToken = newRefreshTokenArray;
                await foundUser.save();
                return next(new ErrorHandler_1.default("Forbidden: Refresh token verification failed", 403));
            }
            if (foundUser._id.toString() !== decoded.id) {
                return next(new ErrorHandler_1.default("Forbidden: User mismatch", 403));
            }
            foundUser.refreshToken = newRefreshTokenArray;
            (0, jwt_1.sendToken)(foundUser, 200, req, res);
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(`Internal Server Error: ${error.message}`, 500));
    }
});
exports.getUserInfo = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const userId = req.user?._id;
        const user = await user_model_1.default.findById(userId);
        if (user) {
            res.status(201).json({
                success: true,
                user,
            });
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.socialAuth = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { email, name, avatar } = req.body;
        const user = await user_model_1.default.findOne({ email });
        if (!user) {
            const newUser = await user_model_1.default.create({ email, name, avatar });
            (0, jwt_1.sendToken)(newUser, 200, req, res);
        }
        else {
            (0, jwt_1.sendToken)(user, 200, req, res);
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updateUserInfo = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { name } = req.body;
        const userId = req.user?._id;
        const user = await user_model_1.default?.findById(userId);
        if (!user) {
            return next(new ErrorHandler_1.default("User not found", 404));
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
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updatePassword = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { oldPassword, newPassword } = req.body;
        if (!oldPassword || !newPassword) {
            return next(new ErrorHandler_1.default("Please enter old and new password", 400));
        }
        const user = await user_model_1.default.findById(req.user?._id).select("+password");
        if (user?.password === undefined) {
            return next(new ErrorHandler_1.default("Invalid user", 400));
        }
        const isCorrectPass = await user.comparedPassword(oldPassword);
        if (!isCorrectPass) {
            return next(new ErrorHandler_1.default("Invalid old password", 400));
        }
        user.password = newPassword;
        await user.save();
        res.status(201).json({
            success: true,
            user,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.updateAvatar = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { avatar } = req.body;
        const userId = req.user._id;
        const user = await user_model_1.default.findById(userId);
        if (!user) {
            return next(new ErrorHandler_1.default("User not found", 404));
        }
        if (avatar && user) {
            if (user?.avatar?.public_id) {
                await cloudinary_1.default.v2.uploader.destroy(user?.avatar?.public_id);
                const myCloud = await cloudinary_1.default.v2.uploader.upload(avatar, {
                    folder: "avatars",
                    width: 150,
                });
                user.avatar = {
                    public_id: myCloud.public_id,
                    url: myCloud.secure_url,
                };
            }
            else {
                const myCloud = await cloudinary_1.default.v2.uploader.upload(avatar, {
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
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 400));
    }
});
exports.getAllUsers = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const users = await user_model_1.default.find().sort({ createdAt: -1 });
        res.status(201).json({
            success: true,
            users,
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.updateUserRole = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { email, role } = req.body;
        const isUserExist = await user_model_1.default.findOne({ email });
        if (isUserExist) {
            const id = isUserExist._id;
            const user = await user_model_1.default.findByIdAndUpdate(id, { role }, { new: true });
            if (!user) {
                return next(new ErrorHandler_1.default("User not found", 404));
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
        }
        else {
            res.status(400).json({
                success: "false",
                message: "User not found",
            });
        }
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
exports.deleteUser = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await user_model_1.default.findById(id);
        if (!user) {
            return next(new ErrorHandler_1.default("User not found", 404));
        }
        await user.deleteOne({ id });
        res.status(200).json({
            success: true,
            message: "User deleted successfully",
        });
    }
    catch (error) {
        return next(new ErrorHandler_1.default(error.message, 500));
    }
});
