const AuditLog = require("../models/AuditLog.model");
const catchAsync = require("../utils/catchAsync");
const { success } = require("../utils/apiResponse");

exports.getAll = catchAsync(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 15;
  const skip = (page - 1) * limit;

  const query = {};

  if (req.query.module) {
    query.module = req.query.module;
  }

  if (req.query.action) {
    query.action = req.query.action;
  }

  if (req.query.userId) {
    query.user = req.query.userId;
  }

  if (req.query.search) {
    const searchRegex = new RegExp(req.query.search, "i");
    query.$or = [
      { description: searchRegex },
      { userName: searchRegex },
      { userEmail: searchRegex },
    ];
  }

  if (req.query.startDate && req.query.endDate) {
    query.createdAt = {
      $gte: new Date(req.query.startDate),
      $lte: new Date(req.query.endDate),
    };
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate("user", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    AuditLog.countDocuments(query),
  ]);

  return success(res, logs, "تم جلب سجل العمليات بنجاح", 200, {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
  });
});
