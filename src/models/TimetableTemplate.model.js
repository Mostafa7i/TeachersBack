const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema(
  {
    day: {
      type: String,
      required: true,
      enum: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    },
    period: { type: Number, required: true, min: 1, max: 8 },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    className: { type: String, trim: true, default: '' },
    room: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const timetableTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'اسم الجدول الشاغر مطلوب'], trim: true },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    entries: [entrySchema],
    isClaimed: { type: Boolean, default: false, index: true },
    claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('TimetableTemplate', timetableTemplateSchema);
