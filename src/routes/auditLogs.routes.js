const express = require("express");
const auditLogsController = require("../controllers/auditLogs.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  requirePermission("audit-logs.view"),
  auditLogsController.getAll,
);

module.exports = router;
