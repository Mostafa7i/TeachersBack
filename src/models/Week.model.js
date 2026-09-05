const mongoose = require('mongoose');

const weekSchema = new mongoose.Schema(
  {
    weekNumber: {
      type: Number,
      required: [true, 'رقم الأسبوع مطلوب'],
    },
    label: {
      type: String,
      required: [true, 'عنوان أو اسم الأسبوع مطلوب'],
      trim: true,
    },
    startDate: {
      type: Date,
      required: [true, 'تاريخ بداية الأسبوع مطلوب'],
    },
    endDate: {
      type: Date,
      required: [true, 'تاريخ نهاية الأسبوع مطلوب'],
    },
    academicYear: {
      type: String,
      required: [true, 'العام الدراسي مطلوب'],
      default: '2026-2027',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

weekSchema.index({ academicYear: 1, weekNumber: 1 }, { unique: true });

module.exports = mongoose.model('Week', weekSchema);
