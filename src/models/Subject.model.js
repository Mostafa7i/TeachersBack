const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم المادة مطلوب'],
      trim: true,
    },
    nameEn: {
      type: String,
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'رمز المادة مطلوب'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    color: {
      type: String,
      default: '#3b82f6',
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

module.exports = mongoose.model('Subject', subjectSchema);
