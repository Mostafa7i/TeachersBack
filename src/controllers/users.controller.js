const User = require("../models/User.model");
const Role = require("../models/Role.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

exports.getAll = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, "i");
    query.$or = [{ name: searchRegex }, { email: searchRegex }];
  }

  if (req.query.role) {
    query.role = req.query.role;
  }

  if (req.query.subject) {
    query.subjects = req.query.subject;
  }

  if (req.query.isActive !== undefined && req.query.isActive !== "") {
    query.isActive = req.query.isActive === "true";
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .populate("role", "name description isSystem")
      .populate("subjects", "name code color")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(query),
  ]);

  return success(res, users, "تم جلب قائمة المستخدمين بنجاح", 200, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});

exports.getTeachers = catchAsync(async (req, res) => {
  // Find roles that might be teacher roles or list all active users with subjects assigned
  const teacherRoles = await Role.find({
    name: { $regex: /معلم|teacher/i },
  }).select("_id");

  const roleIds = teacherRoles.map((r) => r._id);

  const query = { isActive: true };
  if (roleIds.length > 0) {
    query.role = { $in: roleIds };
  }

  const teachers = await User.find(query)
    .populate("role", "name description")
    .populate("subjects", "name code color")
    .sort({ name: 1 });

  return success(res, teachers, "تم جلب قائمة المعلمين بنجاح");
});

exports.getById = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate({
      path: "role",
      populate: {
        path: "permissions",
        select: "name module action",
      },
    })
    .populate("subjects", "name code color");

  if (!user) {
    return error(res, "المستخدم غير موجود", 404);
  }

  return success(res, user, "تم جلب بيانات المستخدم بنجاح");
});

exports.create = catchAsync(async (req, res) => {
  const { name, email, password, role, subjects, isActive } = req.body;

  const existingUser = await User.findOne({
    email: email.toLowerCase().trim(),
  });
  if (existingUser) {
    return error(res, "البريد الإلكتروني مسجل مسبقاً لمستخدم آخر", 400);
  }

  const roleExists = await Role.findById(role);
  if (!roleExists) {
    return error(res, "الدور المحدد غير موجود في النظام", 400);
  }

  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role,
    subjects: subjects || [],
    isActive: isActive !== undefined ? isActive : true,
    createdBy: req.user._id,
  });

  const createdUser = await User.findById(user._id)
    .populate("role", "name isSystem")
    .populate("subjects", "name code color");

  await createAuditLog({
    req,
    action: "CREATE",
    module: "users",
    description: `إنشاء مستخدم جديد: ${user.name} (${user.email}) بالدور: ${roleExists.name}`,
    targetId: user._id,
    targetModel: "User",
    newValue: createdUser,
  });

  return success(res, createdUser, "تم إنشاء المستخدم بنجاح", 201);
});

exports.update = catchAsync(async (req, res) => {
  const { name, email, role, subjects, isActive } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return error(res, "المستخدم غير موجود", 404);
  }

  // Prevent changing email to an already existing one
  if (email && email.toLowerCase().trim() !== user.email) {
    const existingEmail = await User.findOne({
      email: email.toLowerCase().trim(),
    });
    if (existingEmail) {
      return error(res, "البريد الإلكتروني مسجل بالفعل لمستخدم آخر", 400);
    }
    user.email = email.toLowerCase().trim();
  }

  const oldValue = {
    name: user.name,
    email: user.email,
    role: user.role,
    subjects: user.subjects,
    isActive: user.isActive,
  };

  if (name) user.name = name.trim();
  if (role) user.role = role;
  if (subjects !== undefined) user.subjects = subjects;
  if (isActive !== undefined) user.isActive = isActive;

  await user.save();

  const updatedUser = await User.findById(user._id)
    .populate("role", "name isSystem")
    .populate("subjects", "name code color");

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "users",
    description: `تحديث بيانات المستخدم: ${user.name}`,
    targetId: user._id,
    targetModel: "User",
    oldValue,
    newValue: updatedUser,
  });

  return success(res, updatedUser, "تم تحديث بيانات المستخدم بنجاح");
});

exports.remove = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id).populate("role");
  if (!user) {
    return error(res, "المستخدم غير موجود", 404);
  }

  if (user._id.toString() === req.user._id.toString()) {
    return error(res, "لا يمكنك حذف حسابك الحالي", 400);
  }

  if (user.role && user.role.isSystem && user.role.name === "super_admin") {
    const adminCount = await User.countDocuments({ role: user.role._id });
    if (adminCount <= 1) {
      return error(res, "لا يمكن حذف مدير النظام الوحيد في المنصة", 400);
    }
  }

  await User.findByIdAndDelete(req.params.id);

  await createAuditLog({
    req,
    action: "DELETE",
    module: "users",
    description: `حذف المستخدم: ${user.name} (${user.email})`,
    targetId: user._id,
    targetModel: "User",
    oldValue: user,
  });

  return success(res, null, "تم حذف المستخدم بنجاح");
});

exports.toggleStatus = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return error(res, "المستخدم غير موجود", 404);
  }

  if (user._id.toString() === req.user._id.toString()) {
    return error(res, "لا يمكنك تعطيل حسابك الحالي", 400);
  }

  user.isActive = !user.isActive;
  await user.save();

  await createAuditLog({
    req,
    action: "TOGGLE_STATUS",
    module: "users",
    description: `تغيير حالة المستخدم ${user.name} إلى: ${user.isActive ? "نشط" : "معطل"}`,
    targetId: user._id,
    targetModel: "User",
  });

  return success(
    res,
    user,
    `تم ${user.isActive ? "تفعيل" : "تعطيل"} حساب المستخدم بنجاح`,
  );
});

exports.resetPassword = catchAsync(async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return error(res, "يجب ألا تقل كلمة المرور الجديدة عن 6 أحرف", 400);
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return error(res, "المستخدم غير موجود", 404);
  }

  user.password = newPassword;
  await user.save();

  await createAuditLog({
    req,
    action: "RESET_PASSWORD",
    module: "users",
    description: `إعادة تعيين كلمة مرور المستخدم: ${user.name}`,
    targetId: user._id,
    targetModel: "User",
  });

  return success(res, null, "تمت إعادة تعيين كلمة المرور بنجاح");
});
