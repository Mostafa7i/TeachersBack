const { error } = require('../utils/apiResponse');
const Schedule = require('../models/Schedule.model');

/**
 * Middleware factory to check if the authenticated user has a specific permission
 * @param {string|string[]} requiredPermissions - Single permission or array of permissions (ANY match allowed)
 */
const requirePermission = (requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return error(res, 'غير مصرح بالوصول: لا توجد صلاحيات مسندة.', 403);
    }

    const userRole = req.user.role;

    // Super Admin or any system role has unrestricted access to everything
    if (userRole.isSystem) {
      return next();
    }

    const perms = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    // Extract all user's granted permission strings
    const userPermNames = (userRole.permissions || []).map((p) =>
      typeof p === 'string' ? p : p.name
    );

    // Check if user has at least one of the required permissions
    const hasAccess = perms.some((p) => userPermNames.includes(p));

    if (!hasAccess) {
      return error(
        res,
        `ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء (${perms.join(' أو ')}).`,
        403
      );
    }

    next();
  };
};

/**
 * Middleware to enforce strict subject isolation for teachers.
 */
const requireSubjectOwnership = async (req, res, next) => {
  const user = req.user;
  const userRole = user.role;

  // System roles bypass
  if (userRole.isSystem) {
    return next();
  }

  // If modifying an existing schedule by ID
  if (req.params.id) {
    const existingSchedule = await Schedule.findById(req.params.id);
    if (!existingSchedule) {
      return error(res, 'سجل الحصة غير موجود.', 404);
    }

    const userSubjectIds = (user.subjects || []).map((s) => (s._id ? s._id.toString() : s.toString()));
    const targetSubjectId = existingSchedule.subject.toString();

    if (!userSubjectIds.includes(targetSubjectId)) {
      return error(
        res,
        'غير مصرح: لا يمكنك تعديل أو الوصول إلى حصص مادة غير مسندة إليك.',
        403
      );
    }

    req.targetSchedule = existingSchedule;
  }

  // If creating or passing a subject in body
  if (req.body.subject) {
    const userSubjectIds = (user.subjects || []).map((s) => (s._id ? s._id.toString() : s.toString()));
    const bodySubjectId = req.body.subject.toString();

    if (!userSubjectIds.includes(bodySubjectId)) {
      return error(
        res,
        'غير مصرح: المادة المحددة غير مسندة إلى حسابك.',
        403
      );
    }
  }

  next();
};

module.exports = {
  requirePermission,
  requireSubjectOwnership,
};
