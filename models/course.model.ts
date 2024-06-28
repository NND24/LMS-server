import mongoose, { Document, Model, Schema } from "mongoose";

interface Comment extends Document {
  user: object;
  comment: string;
  commentReplies: Comment[];
}

interface Review extends Document {
  user: object;
  rating: number;
  comment: number;
  commentReplies: Comment[];
}

interface Link extends Document {
  title: string;
  url: string;
}

interface CourseData extends Document {
  title: string;
  description: string;
  videoUrl: string;
  videoSection: string;
  videoLength: number;
  videoPlayer: string;
  links: Link[];
  suggestion: string;
  question: Comment[];
}

interface Course extends Document {
  name: string;
  description: string;
  price: number;
  estimatedPrice?: number;
  thumbnail: object;
  tags: string;
  level: string;
  demoUrl: string;
  benefits: { title: string }[];
  prerequisites: { title: string }[];
  reviews: Review[];
  courseData: CourseData[];
  ratings?: number;
  purchased?: number;
}

const reviewSchema = new Schema<Review>({
  user: Object,
  rating: {
    type: Number,
    default: 0,
  },
  comment: String,
});

const linkSchema = new Schema<Link>({
  title: String,
  url: String,
});

const commentSchema = new Schema<Comment>({
  user: Object,
  comment: String,
  commentReplies: String,
});

const courseDataSchema = new Schema<CourseData>({
  videoUrl: String,
  title: String,
  videoSection: String,
  description: String,
  videoLength: Number,
  videoPlayer: String,
  links: [linkSchema],
  suggestion: String,
  question: [commentSchema],
});

const courseSchema = new Schema<Course>({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  estimatedPrice: {
    type: Number,
    required: true,
  },
  thumbnail: {
    public_id: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
  },
  tags: {
    type: String,
    required: true,
  },
  level: {
    type: String,
    required: true,
  },
  demoUrl: {
    type: String,
    required: true,
  },
  benefits: [{ title: String }],
  prerequisites: [{ title: String }],
  reviews: [reviewSchema],
  courseData: [courseDataSchema],
  ratings: {
    type: Number,
    default: 0,
  },
  purchased: {
    type: Number,
    default: 0,
  },
});

const courseModel: Model<Course> = mongoose.model("Course", courseSchema);

export default courseModel;
