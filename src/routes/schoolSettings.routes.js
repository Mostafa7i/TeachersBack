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

// PATCH /logo — receives a Cloudinary URL and saves it to DB
// (replaces the old multer-based POST /upload-logo)
router.patch(
  "/logo",
  requirePermission("settings.edit"),
  schoolSettingsController.updateLogo,
);

module.exports = router;
