const express = require("express");
const schoolSettingsController = require("../controllers/schoolSettings.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  requirePermission(["settings.view", "schedules.view"]),
  schoolSettingsController.getSettings,
);
router.put(
  "/",
  requirePermission("settings.edit"),
  schoolSettingsController.updateSettings,
);
router.post(
  "/upload-logo",
  requirePermission("settings.edit"),
  schoolSettingsController.uploadMiddleware,
  schoolSettingsController.uploadLogo,
);

module.exports = router;
