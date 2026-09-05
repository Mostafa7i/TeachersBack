const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const Role = require("../models/Role.model");
const Subject = require("../models/Subject.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");
const { createAuditLog } = require("../middleware/auditLog.middleware");

const signToken = (id) => {
  return jwt.sign(
    { id },
    process.env.JWT_SECRET ||
      "school_schedule_super_secret_jwt_key_2024_change_me",
    {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    },
  );
};

const sendTokenResponse = (
  user,
  statusCode,
  res,
  message = "تم تسجيل الدخول بنجاح",
) => {
  const token = signToken(user._id);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  res.cookie("token", token, cookieOptions);

  return success(
    res,
    {
      user,
      token,
    },
    message,
    statusCode,
  );
};

exports.login = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return error(res, "يرجى تقديم البريد الإلكتروني وكلمة المرور.", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select("+password")
    .populate({
      path: "role",
      populate: {
        path: "permissions",
        select: "name module action",
      },
    })
    .populate("subjects", "name nameEn code color");

  if (!user || !(await user.comparePassword(password))) {
    return error(res, "البريد الإلكتروني أو كلمة المرور غير صحيحة.", 401);
  }

  if (!user.isActive) {
    return error(
      res,
      "تم تعطيل هذا الحساب. يرجى التواصل مع مسؤول النظام.",
      403,
    );
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // Log action
  await createAuditLog({
    req: { ...req, user },
    action: "LOGIN",
    module: "auth",
    description: `تسجيل دخول ناجح للمستخدم: ${user.name} (${user.email})`,
    targetId: user._id,
    targetModel: "User",
  });

  sendTokenResponse(user, 200, res);
});

exports.logout = catchAsync(async (req, res) => {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });

  if (req.user) {
    await createAuditLog({
      req,
      action: "LOGOUT",
      module: "auth",
      description: `تسجيل خروج للمستخدم: ${req.user.name}`,
      targetId: req.user._id,
      targetModel: "User",
    });
  }

  return success(res, null, "تم تسجيل الخروج بنجاح.");
});

exports.getMe = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate({
      path: "role",
      populate: {
        path: "permissions",
        select: "name module action description",
      },
    })
    .populate("subjects", "name nameEn code color");

  return success(res, user, "تم جلب بيانات المستخدم بنجاح.");
});

exports.changePassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return error(
      res,
      "يرجى إدخال كلمة المرور الحالية وكلمة المرور الجديدة.",
      400,
    );
  }

  if (newPassword.length < 6) {
    return error(res, "يجب ألا تقل كلمة المرور الجديدة عن 6 أحرف.", 400);
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!(await user.comparePassword(currentPassword))) {
    return error(res, "كلمة المرور الحالية غير صحيحة.", 400);
  }

  user.password = newPassword;
  await user.save();

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "auth",
    description: `قام المستخدم ${user.name} بتغيير كلمة المرور الخاصة به.`,
    targetId: user._id,
    targetModel: "User",
  });

  sendTokenResponse(user, 200, res, "تم تغيير كلمة المرور بنجاح.");
});

// Helper to decode Google ID token payload without external heavy deps
const decodeGoogleToken = (token) => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
};

/**
 * Handle Google OAuth login and registration
 */
exports.googleAuth = catchAsync(async (req, res) => {
  const {
    credential,
    email: bodyEmail,
    name: bodyName,
    googleId: bodyGoogleId,
    avatar: bodyAvatar,
  } = req.body;

  let email = bodyEmail;
  let name = bodyName;
  let googleId = bodyGoogleId;
  let avatar = bodyAvatar || "";

  if (credential) {
    const decoded = decodeGoogleToken(credential);
    if (decoded && decoded.email) {
      email = decoded.email;
      name = decoded.name || decoded.given_name || name || "معلم";
      googleId = decoded.sub || googleId;
      avatar = decoded.picture || avatar;
    }
  }

  if (!email) {
    return error(res, "تعذر الحصول على البريد الإلكتروني من حساب Google.", 400);
  }

  email = email.toLowerCase().trim();

  // Find existing user by email or googleId
  let user = await User.findOne({
    $or: [{ email }, ...(googleId ? [{ googleId }] : [])],
  })
    .populate({
      path: "role",
      populate: {
        path: "permissions",
        select: "name module action description",
      },
    })
    .populate("subjects", "name nameEn code color");

  let isNewUser = false;

  if (!user) {
    isNewUser = true;

    // Find default teacher role
    let teacherRole = await Role.findOne({
      $or: [{ name: { $regex: /معلم|teacher/i } }, { isSystem: false }],
    });

    if (!teacherRole) {
      const { ensureSystemInit } = require("../utils/initSystem");
      await ensureSystemInit();
      teacherRole =
        (await Role.findOne({
          $or: [{ name: { $regex: /معلم|teacher/i } }, { isSystem: false }],
        })) || (await Role.findOne({}));
    }

    if (!teacherRole) {
      teacherRole = await Role.create({
        name: "معلم (Teacher)",
        description: "معلم مادة - صلاحيات تلقائية",
        permissions: [],
        isSystem: false,
      });
    }

    // Create new Teacher user with isProfileComplete = false
    user = await User.create({
      name: name || "معلم جديد",
      email,
      googleId: googleId || `google_${Date.now()}`,
      avatar,
      role: teacherRole._id,
      isActive: true,
      isProfileComplete: false,
      subjects: [],
      phone: "",
    });

    user = await User.findById(user._id)
      .populate({
        path: "role",
        populate: {
          path: "permissions",
          select: "name module action description",
        },
      })
      .populate("subjects", "name nameEn code color");

    await createAuditLog({
      req: { ...req, user },
      action: "CREATE",
      module: "auth",
      description: `تسجيل حساب معلم جديد عبر Google: ${user.name} (${user.email})`,
      targetId: user._id,
      targetModel: "User",
    });
  } else {
    // Existing user
    let needsSave = false;
    if (googleId && !user.googleId) {
      user.googleId = googleId;
      needsSave = true;
    }
    if (avatar && !user.avatar) {
      user.avatar = avatar;
      needsSave = true;
    }

    // Check if profile is complete (admins are always complete, teachers need phone & subjects)
    if (user.role?.isSystem) {
      user.isProfileComplete = true;
      needsSave = true;
    } else {
      const hasPhone = !!(user.phone && user.phone.trim());
      const hasSubject =
        Array.isArray(user.subjects) && user.subjects.length > 0;
      user.isProfileComplete = hasPhone && hasSubject;
      needsSave = true;
    }

    user.lastLogin = new Date();
    if (needsSave) {
      await user.save({ validateBeforeSave: false });
    }

    await createAuditLog({
      req: { ...req, user },
      action: "LOGIN",
      module: "auth",
      description: `تسجيل دخول عبر Google: ${user.name} (${user.email})`,
      targetId: user._id,
      targetModel: "User",
    });
  }

  if (!user.isActive) {
    return error(res, "تم تعطيل هذا الحساب. يرجى مراجعة إدارة المدرسة.", 403);
  }

  const message = user.isProfileComplete
    ? "تم تسجيل الدخول عبر Google بنجاح 🎉"
    : "مرحباً بك! يرجى استكمال بياناتك الإلزامية لتفعيل الحساب 📝";

  sendTokenResponse(user, 200, res, message);
});

/**
 * Complete profile for new or incomplete teacher account
 * Requires: name, subjectIds (array of subject ObjectIds)
 */
exports.completeProfile = catchAsync(async (req, res) => {
  const { name, phone, subjectId, subjectIds } = req.body;
  const user = req.user;

  if (!name || !name.trim()) {
    return error(res, "الاسم الكامل مطلوب لاستخدامه في النظام.", 400);
  }

  // Collect all selected subject IDs (array or single)
  let selectedIds = [];
  if (Array.isArray(subjectIds) && subjectIds.length > 0) {
    selectedIds = subjectIds.filter(Boolean);
  } else if (subjectId) {
    selectedIds = [subjectId];
  }

  if (selectedIds.length === 0) {
    return error(
      res,
      "يرجى اختيار مادة دراسية واحدة على الأقل من المواد التي تدرسها.",
      400,
    );
  }

  // Validate subject existence
  const validSubjects = await Subject.find({ _id: { $in: selectedIds } });
  if (validSubjects.length === 0) {
    return error(res, "المواد الدراسية المختارة غير صالحة.", 400);
  }

  const userDoc = await User.findById(user._id);
  if (!userDoc) {
    return error(res, "المستخدم غير موجود.", 404);
  }

  userDoc.name = name.trim();
  if (phone !== undefined) {
    userDoc.phone = phone ? phone.trim() : "";
  }
  userDoc.subjects = validSubjects.map((s) => s._id);
  userDoc.isProfileComplete = true;

  await userDoc.save({ validateBeforeSave: false });

  const populatedUser = await User.findById(userDoc._id)
    .populate({
      path: "role",
      populate: {
        path: "permissions",
        select: "name module action description",
      },
    })
    .populate("subjects", "name nameEn code color");

  const subjectNames = validSubjects.map((s) => s.name).join(" و ");

  await createAuditLog({
    req,
    action: "UPDATE",
    module: "users",
    description: `استكمال بيانات المعلم: ${populatedUser.name} - المواد: ${subjectNames}`,
    targetId: populatedUser._id,
    targetModel: "User",
  });

  return success(
    res,
    populatedUser,
    `مرحباً بك أ. ${populatedUser.name}! تم حفظ موادك الدراسية (${subjectNames}) بنجاح ✅`,
  );
});
