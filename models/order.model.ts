import mongoose, { Document, Schema, Model } from "mongoose";

export interface Order extends Document {
  courseId: string;
  userId: string;
  payment_info: object;
}

const orderSchema = new Schema<Order>(
  {
    courseId: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      required: true,
    },
    payment_info: {
      type: Object,
    },
  },
  { timestamps: true }
);

const orderModel: Model<Order> = mongoose.model("Order", orderSchema);

export default orderModel;
