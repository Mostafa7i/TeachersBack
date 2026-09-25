const Feedback = require('../models/Feedback.model');
const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const catchAsync = require('../utils/catchAsync');
const { success, error } = require('../utils/apiResponse');
const { createAuditLog } = require('../middleware/auditLog.middleware');

/**
 * POST /api/feedback
 * Submit a new complaint or suggestion (Teacher or any user)
 */
exports.createFeedback = catchAsync(async (req, res) => {
  const { type, category, title, description, priority, isAnonymous, attachments } = req.body;
  const user = req.user;

  if (!title || !description) {
    return error(res, 'عنوان وتفاصيل الشكوى أو المقترح مطلوبة', 400);
  }

  const feedback = await Feedback.create({
    teacher: user._id,
    type: type || 'SUGGESTION',
    category: category || 'عام',
    title: title.trim(),
    description: description.trim(),
    priority: priority || 'NORMAL',
    isAnonymous: Boolean(isAnonymous),
    attachments: Array.isArray(attachments) ? attachments : [],
    status: 'PENDING',
  });

  await createAuditLog({
    req,
    action: 'CREATE',
    module: 'feedback',
    description: `تقديم ${type === 'COMPLAINT' ? 'شكوى' : 'مقترح'} جديد: ${title}`,
    targetId: feedback._id,
    targetModel: 'Feedback',
  });

  return success(res, feedback, 'تم إرسال طلبك بنجاح وسيتم مراجعته من قِبل إدارة المدرسة 📨', 201);
});

/**
 * GET /api/feedback/me
 * Get list of complaints/suggestions submitted by current user
 */
exports.getMyFeedback = catchAsync(async (req, res) => {
  const user = req.user;

  const list = await Feedback.find({ teacher: user._id })
    .populate('repliedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  return success(res, list, 'تم جلب الشكاوى والمقترحات بنجاح');
});

/**
 * GET /api/feedback/all
 * Admin: Get all feedback with filters and statistics
 */
exports.getAllFeedback = catchAsync(async (req, res) => {
  const { status, type, priority, teacherId, search } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (type) filter.type = type;
  if (priority) filter.priority = priority;
  if (teacherId) filter.teacher = teacherId;

  if (search && search.trim()) {
    const q = search.trim();
    filter.$or = [
      { title: { $regex: q, $options: 'i' } },
      { description: { $regex: q, $options: 'i' } },
      { category: { $regex: q, $options: 'i' } },
    ];
  }

  const [feedbacks, statsPending, statsResolved, statsTotal] = await Promise.all([
    Feedback.find(filter)
      .populate('teacher', 'name email subjects')
      .populate('repliedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean(),
    Feedback.countDocuments({ status: 'PENDING' }),
    Feedback.countDocuments({ status: 'RESOLVED' }),
    Feedback.countDocuments({}),
  ]);

  // Handle anonymous presentation for teachers if requested
  const sanitizedList = feedbacks.map((item) => {
    if (item.isAnonymous) {
      return {
        ...item,
        teacher: { name: 'معلم (مجهول الهوية)', email: '***' },
      };
    }
    return item;
  });

  return success(
    res,
    {
      feedbacks: sanitizedList,
      stats: {
        total: statsTotal,
        pending: statsPending,
        resolved: statsResolved,
      },
    },
    'تم جلب جميع الشكاوى والمقترحات بنجاح'
  );
});

/**
 * PUT /api/feedback/:id/reply
 * Admin: Reply to a feedback and optionally change status
 */
exports.replyFeedback = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { adminReply, status } = req.body;
  const user = req.user;

  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return error(res, 'الطلب غير موجود', 404);
  }

  if (adminReply !== undefined) {
    feedback.adminReply = adminReply.trim();
    feedback.repliedBy = user._id;
    feedback.repliedAt = new Date();
  }

  if (status) {
    feedback.status = status;
  } else if (feedback.status === 'PENDING') {
    feedback.status = 'RESOLVED';
  }

  await feedback.save();

  // Create notification for the teacher
  try {
    const typeArabic = feedback.type === 'COMPLAINT' ? 'شكواك' : 'مقترحك';
    await Notification.create({
      recipient: feedback.teacher,
      sender: user._id,
      title: `رد جديد من الإدارة على ${typeArabic}`,
      message: `تم الرد على (${feedback.title}): ${feedback.adminReply || 'تم تحديث حالة الطلب'}`,
      type: 'INFO',
      meta: { feedbackId: feedback._id },
    });
  } catch (notifErr) {
    console.error('Notification creation error:', notifErr);
  }

  await createAuditLog({
    req,
    action: 'UPDATE',
    module: 'feedback',
    description: `الرد على الشكوى/المقترح: ${feedback.title}`,
    targetId: feedback._id,
    targetModel: 'Feedback',
  });

  const populated = await Feedback.findById(feedback._id)
    .populate('teacher', 'name email')
    .populate('repliedBy', 'name email')
    .lean();

  return success(res, populated, 'تم حفظ الرد وإشعار المعلم بنجاح ✅');
});

/**
 * DELETE /api/feedback/:id
 */
exports.deleteFeedback = catchAsync(async (req, res) => {
  const { id } = req.params;
  const user = req.user;
  const isSuperAdmin = user.role?.isSystem || false;

  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return error(res, 'الطلب غير موجود', 404);
  }

  if (!isSuperAdmin && feedback.teacher.toString() !== user._id.toString()) {
    return error(res, 'غير مصرح لك بحذف هذا الطلب', 403);
  }

  await Feedback.findByIdAndDelete(id);

  return success(res, null, 'تم حذف الطلب بنجاح');
});
