const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["COMPLAINT", "SUGGESTION", "SCHEDULE_ISSUE", "FACILITY", "OTHER"],
      default: "COMPLAINT",
    },
    category: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      required: [true, "العنوان مطلوب"],
      trim: true,
      maxlength: [200, "العنوان طويل جداً"],
    },
    description: {
      type: String,
      required: [true, "التفاصيل مطلوبة"],
      trim: true,
    },
    priority: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
      default: "MEDIUM",
    },
    status: {
      type: String,
      enum: ["PENDING", "IN_REVIEW", "RESOLVED", "REJECTED"],
      default: "PENDING",
    },
    adminReply: {
      type: String,
      trim: true,
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    repliedAt: {
      type: Date,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    attachments: [
      {
        url: String,
        name: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast lookups
feedbackSchema.index({ teacher: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ priority: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
