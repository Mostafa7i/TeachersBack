const Role = require("../models/Role.model");
const User = require("../models/User.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

exports.getAll = catchAsync(async (req, res) => {
  const roles = await Role.find()
    .populate("permissions", "name description module action")
    .sort({ createdAt: 1 });

  return success(res, roles, "تم جلب قائمة الأدوار بنجاح");
});

exports.getById = catchAsync(async (req, res) => {
  const role = await Role.findById(req.params.id).populate(
    "permissions",
    "name description module action",
  );

  if (!role) {
    return error(res, "الدور غير موجود", 404);
  }

  return success(res, role, "تم جلب بيانات الدور بنجاح");
});

exports.create = catchAsync(async (req, res) => {
  const { name, description, permissions } = req.body;

  const existingRole = await Role.findOne({ name: name.trim() });
  if (existingRole) {
    return error(res, "يوجد دور مسجل بنفس الاسم مسبقاً", 400);
  }

  const role = await Role.create({
    name: name.trim(),
    description: description ? description.trim() : "",
    permissions: permissions || [],
    isSystem: false,
  });

  const createdRole = await Role.findById(role._id).populate("permissions");

  await createAuditLog({
    req,
    action: "CREATE",
    module: "roles",
    description: `إنشاء دور جديد: ${role.name}`,
    targetId: role._id,
    targetModel: "Role",
    newValue: createdRole,
  });

  return success(res, createdRole, "تم إنشاء الدور بنجاح", 201);
});

exports.update = catchAsync(async (req, res) => {
  const { name, description, permissions } = req.body;

  const role = await Role.findById(req.params.id);
  if (!role) {
    return error(res, "الدور غير موجود", 404);
  }

  if (
    role.isSystem &&
    role.name === "super_admin" &&
    name &&
    name !== "super_admin"
  ) {
    return error(res, "لا يمكن تغيير اسم الدور الأساسي لمدير النظام", 400);
  }

  const oldValue = {
    name: role.name,
    description: role.description,
    permissions: role.permissions,
  };

  if (name) role.name = name.trim();
  if (description !== undefined) role.description = description.trim();
  if (permissions !== undefined) role.permissions = permissions;

  await role.save();

  const updatedRole = await Role.findById(role._id).populate("permissions");

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "roles",
    description: `تحديث صلاحيات أو بيانات الدور: ${role.name}`,
    targetId: role._id,
    targetModel: "Role",
    oldValue,
    newValue: updatedRole,
  });

  return success(res, updatedRole, "تم تحديث الدور بنجاح");
});

exports.remove = catchAsync(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) {
    return error(res, "الدور غير موجود", 404);
  }

  if (role.isSystem) {
    return error(res, "لا يمكن حذف الأدوار الافتراضية للنظام", 400);
  }

  const usersWithRole = await User.countDocuments({ role: role._id });
  if (usersWithRole > 0) {
    return error(
      res,
      `لا يمكن حذف هذا الدور لوجود ${usersWithRole} مستخدم مسندين إليه حالياً`,
      400,
    );
  }

  await Role.findByIdAndDelete(req.params.id);

  await createAuditLog({
    req,
    action: "DELETE",
    module: "roles",
    description: `حذف الدور: ${role.name}`,
    targetId: role._id,
    targetModel: "Role",
    oldValue: role,
  });

  return success(res, null, "تم حذف الدور بنجاح");
});
