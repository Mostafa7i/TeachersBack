import mongoose from "mongoose";
import Feedback from "../models/Feedback.model.js";

/*
 * Feedback Controller
 *
 * متوافق مع:
 * POST   /feedback
 * GET    /feedback/me
 * GET    /feedback/all
 * PUT    /feedback/:id/reply
 * DELETE /feedback/:id
 *
 * يفترض أن auth middleware يضع المستخدم الحالي في req.user.
 * ويفترض أن Feedback يحتوي على:
 * user, subject, message, category, rating, status,
 * reply, repliedBy, repliedAt, createdAt, updatedAt.
 */

const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "superadmin",
  "super_admin",
  "مدير",
  "مسؤول",
]);

const getUserId = (req) => req.user?._id || req.user?.id;

const getRoleName = (req) => {
  const role = req.user?.role;
  if (typeof role === "string") return role.toLowerCase().trim();
  return String(role?.name || role?.key || role?.code || "")
    .toLowerCase()
    .trim();
};

const isAdmin = (req) =>
  Boolean(req.user?.isSuperAdmin || ADMIN_ROLES.has(getRoleName(req)));

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const getErrorMessage = (error, fallback) => {
  if (error?.name === "ValidationError") {
    return Object.values(error.errors || {})
      .map((item) => item.message)
      .join("، ") || fallback;
  }
  return error?.message || fallback;
};

/**
 * POST /feedback
 * إنشاء ملاحظة/اقتراح/شكوى من المستخدم الحالي.
 */
export const createFeedback = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "يجب تسجيل الدخول لإرسال الملاحظات",
      });
    }

    const body = req.body || {};

    // دعم أسماء الحقول المختلفة التي قد ترسلها الواجهة الأمامية.
    // كما ندعم إرسال البيانات داخل body.feedback.
    const payload =
      body.feedback && typeof body.feedback === "object"
        ? { ...body.feedback, ...body }
        : body;

    const readText = (...values) => {
      const value = values.find(
        (item) => item !== undefined && item !== null && item !== "",
      );
      if (value && typeof value === "object") {
        return String(value.message || value.content || value.text || "");
      }
      return String(value || "");
    };

    const subject = readText(
      payload.subject,
      payload.title,
      payload.feedbackTitle,
    ).trim();
    const message = readText(
      payload.message,
      payload.content,
      payload.text,
      payload.feedbackText,
      payload.feedbackMessage,
      payload.feedback,
      payload.description,
      payload.details,
      payload.body,
    ).trim();
    const category = String(
      payload.category || payload.type || "GENERAL",
    ).trim();
    const rating = body.rating == null || body.rating === ""
      ? undefined
      : Number(body.rating);

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "نص الملاحظة مطلوب",
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "نص الملاحظة يجب ألا يتجاوز 5000 حرف",
      });
    }

    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({
        success: false,
        message: "التقييم يجب أن يكون رقمًا من 1 إلى 5",
      });
    }

    const feedback = await Feedback.create({
      user: userId,
      subject: subject || undefined,
      message,
      category: category || "GENERAL",
      rating,
      status: "PENDING",
    });

    const populated = await Feedback.findById(feedback._id)
      .populate("user", "name email")
      .lean();

    return res.status(201).json({
      success: true,
      message: "تم إرسال ملاحظتك بنجاح",
      data: populated || feedback,
    });
  } catch (error) {
    console.error("createFeedback error:", error);
    return res.status(500).json({
      success: false,
      message: getErrorMessage(error, "فشل إرسال الملاحظة"),
    });
  }
};

/**
 * GET /feedback/me
 * عرض ملاحظات المستخدم الحالي فقط.
 */
export const getMyFeedback = async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "يجب تسجيل الدخول لعرض الملاحظات",
      });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      100,
    );
    const filter = { user: userId };
    if (req.query.status) filter.status = String(req.query.status).trim();

    const [items, total] = await Promise.all([
      Feedback.find(filter)
        .populate("user", "name email")
        .populate("repliedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Feedback.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("getMyFeedback error:", error);
    return res.status(500).json({
      success: false,
      message: "فشل جلب ملاحظاتك",
    });
  }
};

/**
 * GET /feedback/all
 * عرض جميع الملاحظات للمسؤول مع البحث والفلاتر والترقيم.
 */
export const getAllFeedback = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "ليس لديك صلاحية عرض جميع الملاحظات",
      });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(Number.parseInt(req.query.limit, 10) || 20, 1),
      100,
    );
    const filter = {};

    if (req.query.status) filter.status = String(req.query.status).trim();
    if (req.query.category) filter.category = String(req.query.category).trim();
    if (req.query.userId && isValidId(req.query.userId)) {
      filter.user = req.query.userId;
    }

    const search = String(req.query.search || "").trim();
    if (search) {
      filter.$or = [
        { subject: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const [items, total, counts] = await Promise.all([
      Feedback.find(filter)
        .populate("user", "name email phone")
        .populate("repliedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Feedback.countDocuments(filter),
      Feedback.aggregate([
        { $match: filter },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const summary = counts.reduce(
      (acc, item) => {
        acc[item._id || "UNKNOWN"] = item.count;
        return acc;
      },
      {},
    );

    return res.json({
      success: true,
      data: items,
      summary,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("getAllFeedback error:", error);
    return res.status(500).json({
      success: false,
      message: "فشل جلب جميع الملاحظات",
    });
  }
};

/**
 * PUT /feedback/:id/reply
 * رد المسؤول على الملاحظة وتغيير حالتها إلى REPLIED.
 */
export const replyToFeedback = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "ليس لديك صلاحية الرد على الملاحظات",
      });
    }

    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "معرّف غير صحيح" });
    }

    const reply = String(
      req.body?.reply || req.body?.message || req.body?.response || "",
    ).trim();
    if (!reply) {
      return res.status(400).json({
        success: false,
        message: "نص الرد مطلوب",
      });
    }
    if (reply.length > 5000) {
      return res.status(400).json({
        success: false,
        message: "نص الرد يجب ألا يتجاوز 5000 حرف",
      });
    }

    const updated = await Feedback.findByIdAndUpdate(
      id,
      {
        $set: {
          reply,
          repliedBy: getUserId(req),
          repliedAt: new Date(),
          status: "REPLIED",
        },
      },
      { new: true, runValidators: true },
    )
      .populate("user", "name email")
      .populate("repliedBy", "name email");

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "الملاحظة غير موجودة",
      });
    }

    return res.json({
      success: true,
      message: "تم إرسال الرد بنجاح",
      data: updated,
    });
  } catch (error) {
    console.error("replyToFeedback error:", error);
    return res.status(500).json({
      success: false,
      message: getErrorMessage(error, "فشل إرسال الرد"),
    });
  }
};

/**
 * DELETE /feedback/:id
 * حذف الملاحظة: المسؤول يستطيع حذف أي ملاحظة، والمستخدم يستطيع حذف ملاحظته فقط.
 */
export const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) {
      return res.status(400).json({ success: false, message: "معرّف غير صحيح" });
    }

    const filter = isAdmin(req)
      ? { _id: id }
      : { _id: id, user: getUserId(req) };

    const deleted = await Feedback.findOneAndDelete(filter);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "الملاحظة غير موجودة أو لا تملك صلاحية حذفها",
      });
    }

    return res.json({
      success: true,
      message: "تم حذف الملاحظة بنجاح",
      data: { _id: deleted._id },
    });
  } catch (error) {
    console.error("deleteFeedback error:", error);
    return res.status(500).json({
      success: false,
      message: "فشل حذف الملاحظة",
    });
  }
};

export default {
  createFeedback,
  getMyFeedback,
  getAllFeedback,
  replyToFeedback,
  deleteFeedback,
};
