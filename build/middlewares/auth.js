"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = exports.isAuthenticated = void 0;
const ErrorHandler_1 = __importDefault(require("../utils/ErrorHandler"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const catchAsyncError_1 = require("./catchAsyncError");
const user_model_1 = __importDefault(require("../models/user.model"));
exports.isAuthenticated = (0, catchAsyncError_1.CatchAsyncError)(async (req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return next(new ErrorHandler_1.default("Unauthorized: No token provided", 401));
    }
    const token = authHeader.split(" ")[1];
    if (token) {
        jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN, async (err, decoded) => {
            if (err) {
                return next(new ErrorHandler_1.default("Forbidden: Invalid token", 403));
            }
            if (decoded?.id) {
                const user = await user_model_1.default.findById(decoded.id);
                if (user) {
                    req.user = user;
                    next();
                }
                else {
                    return next(new ErrorHandler_1.default("User not found", 404));
                }
            }
            else {
                return next(new ErrorHandler_1.default("Invalid token payload", 403));
            }
        });
    }
    else {
        return next(new ErrorHandler_1.default("Token not provided", 401));
    }
});
const authorizeRoles = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user?.role || "")) {
            return next(new ErrorHandler_1.default(`Role ${req.user?.role} is not allowed to access this resource`, 403));
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
