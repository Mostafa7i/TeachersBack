const mongoose = require("mongoose");

const schoolSettingsSchema = new mongoose.Schema(
  {
    schoolName: {
      type: String,
      required: [true, "اسم المدرسة مطلوب"],
      default: "مدرسة المستقبل النموذجية",
      trim: true,
    },
    schoolNameEn: {
      type: String,
      default: "Future Model School",
      trim: true,
    },
    logo: {
      type: String,
      default: "",
    },
    ministryHeader: {
      type: String,
      default: "المملكة العربية السعودية\nوزارة التعليم\nإدارة التعليم",
      trim: true,
    },
    academicYear: {
      type: String,
      default: "1447-1448هـ / 2026-2027م",
      trim: true,
    },
    term: {
      type: String,
      default: "الفصل الدراسي الأول",
      trim: true,
    },
    principalName: {
      type: String,
      default: "مدير المدرسة",
      trim: true,
    },
    academicAdvisorName: {
      type: String,
      default: "المرشد الأكاديمي",
      trim: true,
    },
    periodsCount: {
      type: Number,
      default: 6,
      min: 1,
      max: 8,
    },
    periodTimings: {
      type: [
        {
          period: Number,
          startTime: String,
          endTime: String,
        },
      ],
      default: [
        { period: 1, startTime: "06:30", endTime: "07:25" },
        { period: 2, startTime: "07:25", endTime: "08:20" },
        { period: 3, startTime: "08:20", endTime: "09:15" },
        { period: 4, startTime: "09:35", endTime: "10:30" },
        { period: 5, startTime: "10:30", endTime: "11:25" },
        { period: 6, startTime: "11:25", endTime: "12:20" },
        { period: 7, startTime: "12:20", endTime: "01:15" },
        { period: 8, startTime: "01:15", endTime: "02:10" },
      ],
    },
    breakTime: {
      startTime: { type: String, default: "09:15" },
      endTime: { type: String, default: "09:35" },
      afterPeriod: { type: Number, default: 3 },
    },
    workDays: {
      type: [String],
      default: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"],
    },
    phone: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("SchoolSettings", schoolSettingsSchema);
