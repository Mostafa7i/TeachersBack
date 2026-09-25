const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema(
  {
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'المعلم مطلوب'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['COMPLAINT', 'SUGGESTION', 'SCHEDULE_ISSUE', 'FACILITY', 'OTHER'],
        message: 'نوع الطلب غير صالح',
      },
      default: 'SUGGESTION',
      index: true,
    },
    category: {
      type: String,
      trim: true,
      default: 'عام',
    },
    title: {
      type: String,
      required: [true, 'عنوان الشكوى أو المقترح مطلوب'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'التفاصيل مطلوبة'],
      trim: true,
    },
    priority: {
      type: String,
      enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'],
      default: 'NORMAL',
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    adminReply: {
      type: String,
      trim: true,
      default: '',
    },
    repliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    repliedAt: {
      type: Date,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    attachments: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

feedbackSchema.index({ teacher: 1, status: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
