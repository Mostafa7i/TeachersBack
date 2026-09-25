const Feedback = require("../models/Feedback.model");
const catchAsync = require("../utils/catchAsync");
const { success, error } = require("../utils/apiResponse");

/**
 * Create a new feedback / complaint
 * POST /api/feedback
 */
exports.createFeedback = catchAsync(async (req, res) => {
  const { type, category, title, description, priority, isAnonymous } = req.body;

  if (!title || !description) {
    return error(res, "يرجى تعبئة العنوان والتفاصيل", 400);
  }

  const item = await Feedback.create({
    teacher: req.user._id,
    type: type || "COMPLAINT",
    category,
    title,
    description,
    priority: priority || "MEDIUM",
    isAnonymous: Boolean(isAnonymous),
  });

  return success(res, item, "تم إرسال الشكوى/الاقتراح بنجاح ✅", 201);
});

/**
 * Get teacher's own feedback list
 * GET /api/feedback/me
 */
exports.getMyFeedback = catchAsync(async (req, res) => {
  const items = await Feedback.find({ teacher: req.user._id })
    .sort({ createdAt: -1 })
    .lean();

  return success(res, items, "تم جلب قائمة الشكاوى والاقتراحات بنجاح");
});

/**
 * Get all feedback (Admin view)
 * GET /api/feedback/all
 */
exports.getAllFeedback = catchAsync(async (req, res) => {
  const { status, type, priority } = req.query;
  const filter = {};

  if (status) filter.status = status;
  if (type) filter.type = type;
  if (priority) filter.priority = priority;

  const items = await Feedback.find(filter)
    .populate("teacher", "name email")
    .sort({ createdAt: -1 })
    .lean();

  return success(res, items, "تم جلب جميع الشكاوى والاقتراحات بنجاح");
});

/**
 * Reply to feedback or change status (Admin action)
 * PUT /api/feedback/:id/reply
 */
exports.replyFeedback = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { adminReply, status } = req.body;

  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return error(res, "البند غير موجود", 404);
  }

  if (adminReply !== undefined) {
    feedback.adminReply = adminReply;
    feedback.repliedBy = req.user._id;
    feedback.repliedAt = new Date();
  }

  if (status) {
    feedback.status = status;
  }

  await feedback.save();

  return success(res, feedback, "تم تحديث الشكوى/الاقتراح والرد بنجاح ✅");
});

/**
 * Delete feedback item
 * DELETE /api/feedback/:id
 */
exports.deleteFeedback = catchAsync(async (req, res) => {
  const { id } = req.params;

  const feedback = await Feedback.findById(id);
  if (!feedback) {
    return error(res, "البند غير موجود", 404);
  }

  // Teacher can only delete pending feedback
  if (
    feedback.teacher.toString() !== req.user._id.toString() &&
    !req.user.role?.isSystem &&
    req.user.role?.name !== "super_admin"
  ) {
    return error(res, "غير مصرح لك بحذف هذا البند", 403);
  }

  await Feedback.findByIdAndDelete(id);

  return success(res, null, "تم حذف البند بنجاح");
});
