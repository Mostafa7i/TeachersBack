const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const { error } = require('../utils/apiResponse');
const catchAsync = require('../utils/catchAsync');

const protect = catchAsync(async (req, res, next) => {
  let token;

  // 1) Read token from Authorization header, unsigned cookie, or signed cookie
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  } else if (req.signedCookies && req.signedCookies.token) {
    token = req.signedCookies.token;
  }

  if (!token) {
    return error(res, 'غير مصرح لك بالوصول. يرجى تسجيل الدخول أولاً.', 401);
  }

  // 2) Verify token
  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'school_schedule_super_secret_jwt_key_2024_change_me'
    );

    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id)
      .populate({
        path: 'role',
        populate: {
          path: 'permissions',
          select: 'name module action',
        },
      })
      .populate('subjects', 'name code color');

    if (!currentUser) {
      return error(res, 'المستخدم صاحب هذه الجلسة لم يعد موجوداً.', 401);
    }

    // 4) Check if user is active
    if (!currentUser.isActive) {
      return error(res, 'تم تعطيل هذا الحساب. يرجى التواصل مع الإدارة.', 403);
    }

    req.user = currentUser;
    next();
  } catch (err) {
    return error(res, 'جلسة العمل غير صالحة أو منتهية الصلاحية. يرجى تسجيل الدخول مجدداً.', 401);
  }
});

module.exports = {
  protect,
};
