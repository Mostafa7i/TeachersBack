const AuditLog = require('../models/AuditLog.model');

/**
 * Creates an audit log entry in the database
 */
const createAuditLog = async ({
  req,
  action,
  module,
  description,
  targetId = null,
  targetModel = '',
  oldValue = null,
  newValue = null,
}) => {
  try {
    const ipAddress =
      req.headers['x-forwarded-for'] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      '';

    const userAgent = req.headers['user-agent'] || '';

    await AuditLog.create({
      user: req.user?._id || null,
      userName: req.user?.name || 'مستخدم غير مسجل',
      userEmail: req.user?.email || '',
      userRole: req.user?.role?.name || '',
      action,
      module,
      description,
      targetId,
      targetModel,
      oldValue,
      newValue,
      ipAddress: String(ipAddress),
      userAgent,
    });
  } catch (err) {
    console.error('❌ خطأ أثناء حفظ سجل العمليات (AuditLog):', err.message);
  }
};

module.exports = {
  createAuditLog,
};
