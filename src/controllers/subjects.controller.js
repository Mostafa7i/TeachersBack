const Subject = require("../models/Subject.model");
const Schedule = require("../models/Schedule.model");
const User = require("../models/User.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

exports.getAll = catchAsync(async (req, res) => {
  const query = {};

  if (req.query.isActive !== undefined && req.query.isActive !== "") {
    query.isActive = req.query.isActive === "true";
  }

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, "i");
    query.$or = [
      { name: searchRegex },
      { code: searchRegex },
      { nameEn: searchRegex },
    ];
  }

  const subjects = await Subject.find(query).sort({ name: 1 });
  return success(res, subjects, "تم جلب قائمة المواد بنجاح");
});

exports.getById = catchAsync(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) {
    return error(res, "المادة غير موجودة", 404);
  }
  return success(res, subject, "تم جلب بيانات المادة بنجاح");
});

exports.create = catchAsync(async (req, res) => {
  const { name, nameEn, code, color, isActive } = req.body;

  const existing = await Subject.findOne({ code: code.toUpperCase().trim() });
  if (existing) {
    return error(res, "رمز المادة مسجل مسبقاً لمادة أخرى", 400);
  }

  const subject = await Subject.create({
    name: name.trim(),
    nameEn: nameEn ? nameEn.trim() : "",
    code: code.toUpperCase().trim(),
    color: color || "#3b82f6",
    isActive: isActive !== undefined ? isActive : true,
    createdBy: req.user._id,
  });

  await createAuditLog({
    req,
    action: "CREATE",
    module: "subjects",
    description: `إضافة مادة دراسية جديدة: ${subject.name} (${subject.code})`,
    targetId: subject._id,
    targetModel: "Subject",
    newValue: subject,
  });

  return success(res, subject, "تمت إضافة المادة بنجاح", 201);
});

exports.update = catchAsync(async (req, res) => {
  const { name, nameEn, code, color, isActive } = req.body;

  const subject = await Subject.findById(req.params.id);
  if (!subject) {
    return error(res, "المادة غير موجودة", 404);
  }

  if (code && code.toUpperCase().trim() !== subject.code) {
    const existing = await Subject.findOne({ code: code.toUpperCase().trim() });
    if (existing) {
      return error(res, "رمز المادة مسجل مسبقاً لمادة أخرى", 400);
    }
    subject.code = code.toUpperCase().trim();
  }

  const oldValue = {
    name: subject.name,
    nameEn: subject.nameEn,
    code: subject.code,
    color: subject.color,
    isActive: subject.isActive,
  };

  if (name) subject.name = name.trim();
  if (nameEn !== undefined) subject.nameEn = nameEn.trim();
  if (color) subject.color = color;
  if (isActive !== undefined) subject.isActive = isActive;

  await subject.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "subjects",
    description: `تعديل بيانات المادة الدراسية: ${subject.name}`,
    targetId: subject._id,
    targetModel: "Subject",
    oldValue,
    newValue: subject,
  });

  return success(res, subject, "تم تعديل المادة بنجاح");
});

exports.remove = catchAsync(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) {
    return error(res, "المادة غير موجودة", 404);
  }

  // Check if subject is used in any schedules
  const scheduleCount = await Schedule.countDocuments({ subject: subject._id });
  if (scheduleCount > 0) {
    return error(
      res,
      `لا يمكن حذف هذه المادة لارتباطها بـ ${scheduleCount} حصة في الجداول المدرسية. يمكنك تعطيلها بدلاً من ذلك.`,
      400,
    );
  }

  // Remove subject from any teachers
  await User.updateMany(
    { subjects: subject._id },
    { $pull: { subjects: subject._id } },
  );

  await Subject.findByIdAndDelete(req.params.id);

  await createAuditLog({
    req,
    action: "DELETE",
    module: "subjects",
    description: `حذف المادة الدراسية: ${subject.name}`,
    targetId: subject._id,
    targetModel: "Subject",
    oldValue: subject,
  });

  return success(res, null, "تم حذف المادة بنجاح");
});

exports.toggleStatus = catchAsync(async (req, res) => {
  const subject = await Subject.findById(req.params.id);
  if (!subject) {
    return error(res, "المادة غير موجودة", 404);
  }

  subject.isActive = !subject.isActive;
  await subject.save();

  await createAuditLog({
    req,
    action: "TOGGLE_STATUS",
    module: "subjects",
    description: `تغيير حالة المادة ${subject.name} إلى: ${subject.isActive ? "نشطة" : "معطلة"}`,
    targetId: subject._id,
    targetModel: "Subject",
  });

  return success(
    res,
    subject,
    `تم ${subject.isActive ? "تفعيل" : "تعطيل"} المادة بنجاح`,
  );
});
