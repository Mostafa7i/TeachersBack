const Permission = require("../models/Permission.model");
const Role = require("../models/Role.model");
const Subject = require("../models/Subject.model");
const User = require("../models/User.model");
const SchoolSettings = require("../models/SchoolSettings.model");

const DEFAULT_PERMISSIONS = [
  // Schedules
  { name: "schedules.view", description: "مشاهدة الجداول الأسبوعية", module: "schedules", action: "view" },
  { name: "schedules.create", description: "إنشاء حصة أو جدول جديد", module: "schedules", action: "create" },
  { name: "schedules.edit", description: "تعديل كامل بيانات الحصة والجدول", module: "schedules", action: "edit" },
  { name: "schedules.edit_title", description: "تعديل عنوان الدرس فقط", module: "schedules", action: "edit_title" },
  { name: "schedules.edit_homework", description: "تعديل الواجبات فقط", module: "schedules", action: "edit_homework" },
  { name: "schedules.edit_activities", description: "تعديل الأنشطة فقط", module: "schedules", action: "edit_activities" },
  { name: "schedules.edit_notes", description: "تعديل الملاحظات فقط", module: "schedules", action: "edit_notes" },
  { name: "schedules.delete", description: "حذف حصة من الجدول", module: "schedules", action: "delete" },
  { name: "schedules.copy_week", description: "نسخ جدول أسبوع كامل إلى أسبوع آخر", module: "schedules", action: "copy_week" },
  { name: "schedules.export", description: "تصدير الجدول كصورة PNG أو مستند PDF", module: "schedules", action: "export" },

  // Users
  { name: "users.view", description: "عرض قائمة المستخدمين والمعلمين", module: "users", action: "view" },
  { name: "users.create", description: "إضافة مستخدم أو معلم جديد", module: "users", action: "create" },
  { name: "users.edit", description: "تعديل بيانات المستخدم أو المعلم", module: "users", action: "edit" },
  { name: "users.delete", description: "حذف مستخدم أو معلم من النظام", module: "users", action: "delete" },

  // Roles
  { name: "roles.view", description: "عرض الأدوار والصلاحيات", module: "roles", action: "view" },
  { name: "roles.create", description: "إنشاء دور جديد", module: "roles", action: "create" },
  { name: "roles.edit", description: "تعديل الأدوار والصلاحيات المسندة", module: "roles", action: "edit" },
  { name: "roles.delete", description: "حذف دور من النظام", module: "roles", action: "delete" },

  // Subjects
  { name: "subjects.view", description: "عرض المواد الدراسية", module: "subjects", action: "view" },
  { name: "subjects.create", description: "إضافة مادة دراسية جديدة", module: "subjects", action: "create" },
  { name: "subjects.edit", description: "تعديل مادة دراسية", module: "subjects", action: "edit" },
  { name: "subjects.delete", description: "حذف مادة دراسية", module: "subjects", action: "delete" },

  // Settings
  { name: "settings.view", description: "عرض إعدادات وبيانات المدرسة", module: "settings", action: "view" },
  { name: "settings.edit", description: "تعديل إعدادات وشعار المدرسة", module: "settings", action: "edit" },

  // Audit logs
  { name: "audit-logs.view", description: "عرض سجل العمليات وتدقيق النظام", module: "audit-logs", action: "view" },
];

const REQUIRED_SUBJECTS = [
  { name: "فنية", nameEn: "Art Education", code: "ART", color: "#ec4899" },
  { name: "رياضيات", nameEn: "Mathematics", code: "MATH", color: "#2563eb" },
  { name: "رقمية", nameEn: "Digital Skills", code: "DIGITAL", color: "#0284c7" },
  { name: "توحيد", nameEn: "Tawhid", code: "TAWHID", color: "#059669" },
  { name: "English", nameEn: "English Language", code: "ENG", color: "#7c3aed" },
  { name: "لغتي", nameEn: "Arabic (Lughati)", code: "LUGHATI", color: "#10b981" },
  { name: "بدنية", nameEn: "Physical Education", code: "PE", color: "#f59e0b" },
  { name: "تفسير", nameEn: "Tafsir", code: "TAFSIR", color: "#0d9488" },
  { name: "اجتماعيات", nameEn: "Social Studies", code: "SOCIAL", color: "#d97706" },
  { name: "حديث", nameEn: "Hadith", code: "HADITH", color: "#84cc16" },
  { name: "علوم", nameEn: "Science", code: "SCI", color: "#06b6d4" },
];

/**
 * Ensures all fundamental database collections (Permissions, Roles, Admin User, Subjects, Settings)
 * are populated and ready for production on Vercel / local development.
 */
const ensureSystemInit = async () => {
  try {
    // 1) Ensure Permissions
    const permMap = {};
    for (const perm of DEFAULT_PERMISSIONS) {
      let p = await Permission.findOne({ name: perm.name });
      if (!p) {
        p = await Permission.create(perm);
      }
      permMap[perm.name] = p._id;
    }

    // 2) Ensure Super Admin Role
    let superAdminRole = await Role.findOne({ isSystem: true });
    if (!superAdminRole) {
      superAdminRole = await Role.findOne({ name: "super_admin" });
    }
    if (!superAdminRole) {
      const allPermIds = Object.values(permMap);
      superAdminRole = await Role.create({
        name: "super_admin",
        description: "مدير النظام بصلاحيات كاملة وغير مقيدة",
        permissions: allPermIds,
        isSystem: true,
      });
      console.log("🛡️ تم إنشاء دور مدير النظام (super_admin)");
    }

    // 3) Ensure Teacher Role
    let teacherRole = await Role.findOne({
      $or: [
        { name: { $regex: /معلم|teacher/i } },
        { isSystem: false },
      ],
    });
    if (!teacherRole) {
      const teacherPerms = [
        permMap["schedules.view"],
        permMap["schedules.edit_title"],
        permMap["schedules.edit_homework"],
        permMap["schedules.edit_activities"],
        permMap["schedules.edit_notes"],
        permMap["schedules.export"],
        permMap["subjects.view"],
      ].filter(Boolean);

      teacherRole = await Role.create({
        name: "معلم (Teacher)",
        description: "معلم مادة - صلاحيات تحضير وتعديل الحقول الخاصة بحصصه ومادته وتصدير الجدول",
        permissions: teacherPerms,
        isSystem: false,
      });
      console.log("👨‍🏫 تم إنشاء دور المعلم (معلم (Teacher))");
    }

    // 4) Ensure Default Admin User
    const existingAdmin = await User.findOne({ email: "admin@school.com" });
    if (!existingAdmin) {
      await User.create({
        name: "مدير النظام",
        email: "admin@school.com",
        password: "Admin@123456",
        role: superAdminRole._id,
        isActive: true,
        isProfileComplete: true,
        phone: "0500000000",
      });
      console.log("👤 تم إنشاء حساب المدير الافتراضي: admin@school.com / Admin@123456");
    }

    // 5) Ensure Subjects
    for (const sub of REQUIRED_SUBJECTS) {
      const existing = await Subject.findOne({
        $or: [
          { code: sub.code },
          { name: sub.name },
          { name: { $regex: new RegExp(`^${sub.name}$`, "i") } },
        ],
      });
      if (!existing) {
        await Subject.create(sub);
      }
    }

    // 6) Ensure School Settings
    const existingSettings = await SchoolSettings.findOne();
    if (!existingSettings) {
      await SchoolSettings.create({
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

    return { success: true };
  } catch (err) {
    console.error("❌ خطأ أثناء تهيئة النظام التلقائية:", err.message);
    return { success: false, error: err.message };
  }
};

module.exports = { ensureSystemInit, DEFAULT_PERMISSIONS, REQUIRED_SUBJECTS };
