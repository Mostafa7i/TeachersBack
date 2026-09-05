const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const Schedule = require('../models/Schedule.model');
const Week = require('../models/Week.model');
const catchAsync = require('../utils/catchAsync');
const { success, error } = require('../utils/apiResponse');

// 1. Get current user's notifications
exports.getMyNotifications = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ recipient: req.user._id })
      .populate('sender', 'name email role')
      .populate('week', 'label weekNumber academicYear')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments({ recipient: req.user._id }),
    Notification.countDocuments({ recipient: req.user._id, isRead: false }),
  ]);

  return success(res, {
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

// 2. Mark single notification as read
exports.markAsRead = catchAsync(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

  if (!notification) {
    return error(res, 'الإشعار غير موجود أو لا تملك صلاحية الوصول إليه', 404);
  }

  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    isRead: false,
  });

  return success(res, { notification, unreadCount }, 'تم تحديث حالة الإشعار');
});

// 3. Mark all notifications as read
exports.markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  return success(res, { unreadCount: 0 }, 'تم تحديد جميع الإشعارات كمقروءة');
});

// 4. Send reminder to teacher(s) - Admin only
exports.sendReminder = catchAsync(async (req, res) => {
  const { teacherId, teacherIds, weekId, title, message, type = 'WARNING', sendToAllIncomplete } = req.body;

  let weekLabel = '';
  if (weekId) {
    const week = await Week.findById(weekId);
    if (week) weekLabel = week.label;
  }

  let targetTeacherIds = [];

  if (sendToAllIncomplete && weekId) {
    const incompleteSchedules = await Schedule.find({
      week: weekId,
      teacher: { $ne: null },
      $or: [
        { lessonTitle: { $in: ['', null] } },
        { homework: { $in: ['', null] } },
      ],
    }).distinct('teacher');

    targetTeacherIds = incompleteSchedules.map((id) => id.toString());
  } else if (Array.isArray(teacherIds) && teacherIds.length > 0) {
    targetTeacherIds = teacherIds;
  } else if (teacherId) {
    targetTeacherIds = [teacherId];
  }

  if (targetTeacherIds.length === 0) {
    return error(res, 'لم يتم تحديد أي معلم لإرسال التنبيه إليه أو لا يوجد معلمون متأخرون', 400);
  }

  const defaultTitle = title || ('تنبيه: إكمال الخطة والتحضير الأسبوعي (' + (weekLabel || 'الأسبوع الحالي') + ')');
  const defaultMessage =
    message ||
    ('نود تذكيرك بضرورة استكمال تعبئة خانات عنوان وموضوع الدرس والواجبات المنزلية للحصص المسندة إليك في خطة ' + (weekLabel || 'الأسبوع') + ' في أقرب وقت.');

  const notificationsToCreate = targetTeacherIds.map((tId) => ({
    recipient: tId,
    sender: req.user._id,
    title: defaultTitle,
    message: defaultMessage,
    type: type || 'WARNING',
    week: weekId || null,
    isRead: false,
    meta: {
      weekLabel,
      sentAt: new Date(),
    },
  }));

  const created = await Notification.insertMany(notificationsToCreate);

  return success(
    res,
    { count: created.length },
    'تم إرسال التنبيه بنجاح إلى ' + created.length + ' معلم 🎉',
    201
  );
});
