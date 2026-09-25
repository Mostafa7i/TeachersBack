const Week = require("../models/Week.model");
const Schedule = require("../models/Schedule.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

exports.getAll = catchAsync(async (req, res) => {
  const query = {};
  if (req.query.academicYear) {
    query.academicYear = req.query.academicYear;
  }
  if (req.query.isActive !== undefined && req.query.isActive !== "") {
    query.isActive = req.query.isActive === "true";
  }

  const weeks = await Week.find(query).sort({ startDate: 1 });
  return success(res, weeks, "تم جلب قائمة الأسابيع بنجاح");
});

exports.getCurrent = catchAsync(async (req, res) => {
  const now = new Date();

  // Find week containing current date
  let week = await Week.findOne({
    startDate: { $lte: now },
    endDate: { $gte: now },
    isActive: true,
  });

  // If not found, find the latest active week or nearest upcoming
  if (!week) {
    week = await Week.findOne({ isActive: true }).sort({ startDate: -1 });
  }

  // If still no weeks exist at all, return null
  if (!week) {
    return success(res, null, "لا يوجد أسبوع حالي مسجل في النظام");
  }

  return success(res, week, "تم جلب بيانات الأسبوع الحالي بنجاح");
});

exports.getById = catchAsync(async (req, res) => {
  const week = await Week.findById(req.params.id);
  if (!week) {
    return error(res, "الأسبوع غير موجود", 404);
  }
  return success(res, week, "تم جلب بيانات الأسبوع بنجاح");
});

exports.create = catchAsync(async (req, res) => {
  const { weekNumber, label, startDate, endDate, academicYear, isActive } =
    req.body;

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (start >= end) {
    return error(res, "تاريخ بداية الأسبوع يجب أن يكون قبل تاريخ النهاية", 400);
  }

  const existing = await Week.findOne({
    academicYear: academicYear || "2026-2027",
    weekNumber,
  });

  if (existing) {
    return error(res, "رقم الأسبوع مسجل مسبقاً لنفس العام الدراسي", 400);
  }

  const week = await Week.create({
    weekNumber,
    label: label.trim(),
    startDate: start,
    endDate: end,
    academicYear: academicYear || "2026-2027",
    isActive: isActive !== undefined ? isActive : true,
    createdBy: req.user._id,
  });

  await createAuditLog({
    req,
    action: "CREATE",
    module: "weeks",
    description: `إنشاء أسبوع جديد: ${week.label} (أسبوع ${week.weekNumber})`,
    targetId: week._id,
    targetModel: "Week",
    newValue: week,
  });

  return success(res, week, "تم إنشاء الأسبوع بنجاح", 201);
});

exports.update = catchAsync(async (req, res) => {
  const { weekNumber, label, startDate, endDate, academicYear, isActive } =
    req.body;

  const week = await Week.findById(req.params.id);
  if (!week) {
    return error(res, "الأسبوع غير موجود", 404);
  }

  const oldValue = { ...week.toObject() };

  if (startDate && endDate) {
    if (new Date(startDate) >= new Date(endDate)) {
      return error(
        res,
        "تاريخ بداية الأسبوع يجب أن يكون قبل تاريخ النهاية",
        400,
      );
    }
    week.startDate = new Date(startDate);
    week.endDate = new Date(endDate);
  }

  if (weekNumber !== undefined) week.weekNumber = weekNumber;
  if (label) week.label = label.trim();
  if (academicYear) week.academicYear = academicYear;
  if (isActive !== undefined) week.isActive = isActive;

  await week.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "weeks",
    description: `تحديث بيانات الأسبوع: ${week.label}`,
    targetId: week._id,
    targetModel: "Week",
    oldValue,
    newValue: week,
  });

  return success(res, week, "تم تحديث الأسبوع بنجاح");
});

exports.remove = catchAsync(async (req, res) => {
  const week = await Week.findById(req.params.id);
  if (!week) {
    return error(res, "الأسبوع غير موجود", 404);
  }

  // Delete all schedules related to this week
  await Schedule.deleteMany({ week: week._id });
  await Week.findByIdAndDelete(req.params.id);

  await createAuditLog({
    req,
    action: "DELETE",
    module: "weeks",
    description: `حذف الأسبوع: ${week.label} وجميع الحصص المرتبطة به`,
    targetId: week._id,
    targetModel: "Week",
    oldValue: week,
  });

  return success(res, null, "تم حذف الأسبوع والجداول المرتبطة به بنجاح");
});
