const SchoolSettings = require("../models/SchoolSettings.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

exports.getSettings = catchAsync(async (req, res) => {
  let settings = await SchoolSettings.findOne();
  if (!settings) {
    settings = await SchoolSettings.create({
      schoolName: "مدرسة المستقبل النموذجية",
      schoolNameEn: "Future Model School",
      academicYear: "1447-1448هـ / 2026-2027م",
      term: "الفصل الدراسي الأول",
      principalName: "مدير المدرسة",
      academicAdvisorName: "المرشد الطلابي",
      periodsCount: 6,
      workDays: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"],
    });
  }
  return success(res, settings, "تم جلب إعدادات المدرسة بنجاح");
});

exports.updateSettings = catchAsync(async (req, res) => {
  const {
    schoolName,
    schoolNameEn,
    logo,
    ministryHeader,
    academicYear,
    term,
    principalName,
    academicAdvisorName,
    periodsCount,
    periodTimings,
    breakTime,
    workDays,
    phone,
    email,
    address,
  } = req.body;

  let settings = await SchoolSettings.findOne();
  if (!settings) {
    settings = new SchoolSettings();
  }

  const oldValue = { ...settings.toObject() };

  if (schoolName) settings.schoolName = schoolName.trim();
  if (schoolNameEn !== undefined) settings.schoolNameEn = schoolNameEn.trim();
  if (logo !== undefined) settings.logo = logo;
  if (ministryHeader !== undefined)
    settings.ministryHeader = ministryHeader.trim();
  if (academicYear) settings.academicYear = academicYear.trim();
  if (term) settings.term = term.trim();
  if (principalName !== undefined)
    settings.principalName = principalName.trim();
  if (academicAdvisorName !== undefined)
    settings.academicAdvisorName = academicAdvisorName.trim();
  if (periodsCount) settings.periodsCount = Number(periodsCount);
  if (periodTimings && Array.isArray(periodTimings))
    settings.periodTimings = periodTimings;
  if (breakTime && typeof breakTime === "object") {
    settings.breakTime = {
      startTime: breakTime.startTime || "09:15",
      endTime: breakTime.endTime || "09:35",
      afterPeriod: Number(breakTime.afterPeriod) || 3,
    };
  }
  if (workDays && Array.isArray(workDays)) settings.workDays = workDays;
  if (phone !== undefined) settings.phone = phone.trim();
  if (email !== undefined) settings.email = email.trim();
  if (address !== undefined) settings.address = address.trim();

  settings.updatedBy = req.user._id;
  await settings.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "settings",
    description: `تحديث إعدادات وبيانات المدرسة: ${settings.schoolName}`,
    targetId: settings._id,
    targetModel: "SchoolSettings",
    oldValue,
    newValue: settings,
  });

  return success(res, settings, "تم حفظ إعدادات المدرسة بنجاح");
});

/**
 * PATCH /api/school-settings/logo
 * Accepts a Cloudinary URL from the frontend and saves it to the DB.
 * No file upload needed — Cloudinary handles storage directly from browser.
 */
exports.updateLogo = catchAsync(async (req, res) => {
  const { logoUrl } = req.body;

  if (!logoUrl || typeof logoUrl !== "string") {
    return error(res, "يرجى إرسال رابط الشعار (logoUrl)", 400);
  }

  if (!logoUrl.startsWith("http")) {
    return error(res, "رابط الشعار غير صالح", 400);
  }

  let settings = await SchoolSettings.findOne();
  if (!settings) {
    settings = new SchoolSettings();
  }

  settings.logo = logoUrl;
  settings.updatedBy = req.user._id;
  await settings.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "settings",
    description: "تم تحديث شعار المدرسة عبر Cloudinary",
    targetId: settings._id,
    targetModel: "SchoolSettings",
  });

  return success(res, { logoUrl, settings }, "تم تحديث شعار المدرسة بنجاح");
});
