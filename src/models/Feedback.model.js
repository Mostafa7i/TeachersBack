import mongoose from "mongoose";

const { Schema } = mongoose;

const feedbackSchema = new Schema(
  {
    // المستخدم الذي أرسل الملاحظة
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "المستخدم مطلوب"],
      index: true,
    },

    // عنوان مختصر اختياري للملاحظة
    subject: {
      type: String,
      trim: true,
      maxlength: [200, "عنوان الملاحظة لا يمكن أن يتجاوز 200 حرف"],
      default: "",
    },

    // محتوى الملاحظة
    message: {
      type: String,
      required: [true, "نص الملاحظة مطلوب"],
      trim: true,
      minlength: [2, "نص الملاحظة قصير جدًا"],
      maxlength: [5000, "نص الملاحظة لا يمكن أن يتجاوز 5000 حرف"],
    },

    // GENERAL | SUGGESTION | COMPLAINT | BUG | OTHER
    category: {
      type: String,
      trim: true,
      uppercase: true,
      default: "GENERAL",
      enum: {
        values: ["GENERAL", "SUGGESTION", "COMPLAINT", "BUG", "OTHER"],
        message: "نوع الملاحظة غير صحيح",
      },
      index: true,
    },

    // تقييم اختياري من 1 إلى 5
    rating: {
      type: Number,
      min: [1, "التقييم يجب أن يكون من 1 إلى 5"],
      max: [5, "التقييم يجب أن يكون من 1 إلى 5"],
      validate: {
        validator: (value) => value == null || Number.isInteger(value),
        message: "التقييم يجب أن يكون رقمًا صحيحًا",
      },
    },

    // PENDING | IN_REVIEW | REPLIED | CLOSED
    status: {
      type: String,
      uppercase: true,
      default: "PENDING",
      enum: {
        values: ["PENDING", "IN_REVIEW", "REPLIED", "CLOSED"],
        message: "حالة الملاحظة غير صحيحة",
      },
      index: true,
    },

    // رد المسؤول
    reply: {
      type: String,
      trim: true,
      maxlength: [5000, "الرد لا يمكن أن يتجاوز 5000 حرف"],
      default: "",
    },

    repliedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    repliedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// منع حفظ رد بدون تسجيل المسؤول وتاريخ الرد.
feedbackSchema.pre("validate", function (next) {
  if (this.status === "REPLIED" && !this.reply?.trim()) {
    return next(new Error("لا يمكن جعل الملاحظة مجابًا عليها بدون نص رد"));
  }

  if (this.reply?.trim() && !this.repliedAt) {
    this.repliedAt = new Date();
  }

  next();
});

// فهارس شائعة الاستخدام في /feedback/me و /feedback/all.
feedbackSchema.index({ user: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ category: 1, createdAt: -1 });
feedbackSchema.index({ createdAt: -1 });

// إخفاء المسافات الزائدة من الردود عند التحديثات المباشرة.
feedbackSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  const set = update.$set || update;

  if (typeof set.reply === "string") {
    set.reply = set.reply.trim();
  }
  if (typeof set.subject === "string") {
    set.subject = set.subject.trim();
  }
  if (typeof set.message === "string") {
    set.message = set.message.trim();
  }

  if (update.$set) update.$set = set;
  else this.setUpdate(set);

  next();
});

const Feedback =
  mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

export default Feedback;
