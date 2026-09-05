const express = require("express");
const permissionsController = require("../controllers/permissions.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  requirePermission(["roles.view", "roles.edit", "roles.create"]),
  permissionsController.getAll,
);

module.exports = router;
