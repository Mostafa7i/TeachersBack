const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema(
  {
    week: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Week',
      required: [true, 'الأسبوع مطلوب'],
      index: true,
    },
    day: {
      type: String,
      required: [true, 'اليوم مطلوب'],
      enum: {
        values: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
        message: 'اليوم غير صالح',
      },
    },
    dayDate: {
      type: Date,
      required: [true, 'تاريخ الحصة مطلوب'],
    },
    period: {
      type: Number,
      required: [true, 'رقم الحصة مطلوب'],
      min: [1, 'رقم الحصة يجب أن يكون 1 على الأقل'],
      max: [8, 'رقم الحصة لا يتجاوز 8'],
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'المادة مطلوبة'],
      index: true,
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    className: {
      type: String,
      trim: true,
      default: '', // e.g. "ثاني ثاني", "أول أول", "ثالث ثاني"
    },
    room: {
      type: String,
      trim: true,
      default: '', // e.g. "قاعة 1", "معمل الحاسب"
    },
    lessonTitle: {
      type: String,
      trim: true,
      default: '',
    },
    homework: {
      type: String,
      trim: true,
      default: '',
    },
    activities: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find cells and avoid duplicates per week+day+period+teacher
scheduleSchema.index({ week: 1, day: 1, period: 1, teacher: 1 });
scheduleSchema.index({ week: 1, day: 1, period: 1, subject: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
