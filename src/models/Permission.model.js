const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الصلاحية مطلوب'],
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    module: {
      type: String,
      required: [true, 'اسم الوحدة (Module) مطلوب'],
      trim: true,
      index: true,
    },
    action: {
      type: String,
      required: [true, 'نوع الإجراء مطلوب'],
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Permission', permissionSchema);
