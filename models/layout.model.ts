import { Schema, model, Document } from "mongoose";

interface FaqItem extends Document {
  question: string;
  answer: string;
}

interface Category extends Document {
  title: string;
}

interface BannerImage extends Document {
  public_id: string;
  url: string;
}

interface Layout extends Document {
  type: string;
  faq?: FaqItem[];
  categories?: Category[];
  banner?: {
    image: BannerImage;
    title: string;
    subTitle: string;
  };
}

const faqSchema = new Schema<FaqItem>({
  question: { type: String, required: true },
  answer: { type: String, required: true },
});

const categorySchema = new Schema<Category>({
  title: { type: String, required: true },
});

const bannerImageSchema = new Schema<BannerImage>({
  public_id: { type: String, required: true },
  url: { type: String, required: true },
});

const layoutSchema = new Schema<Layout>({
  type: { type: String, required: true },
  faq: { type: [faqSchema], default: [] },
  categories: { type: [categorySchema], default: [] },
  banner: {
    image: bannerImageSchema,
    title: { type: String },
    subTitle: { type: String },
  },
});

const layoutModel = model<Layout>("Layout", layoutSchema);

export default layoutModel;
