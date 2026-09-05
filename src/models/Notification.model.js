const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'المستلم مطلوب'],
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    title: {
      type: String,
      required: [true, 'عنوان التنبيه مطلوب'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'نص التنبيه مطلوب'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['WARNING', 'INFO', 'REMINDER', 'SYSTEM', 'SUCCESS'],
      default: 'REMINDER',
    },
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Week',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);