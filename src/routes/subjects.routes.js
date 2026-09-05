const express = require("express");
const { body } = require("express-validator");
const subjectsController = require("../controllers/subjects.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

router.use(protect);

const subjectValidation = [
  body("name").trim().notEmpty().withMessage("اسم المادة مطلوب"),
  body("code").trim().notEmpty().withMessage("رمز المادة مطلوب"),
];

router.get(
  "/",
  requirePermission(["subjects.view", "schedules.view"]),
  subjectsController.getAll,
);
router.get(
  "/:id",
  requirePermission("subjects.view"),
  subjectsController.getById,
);
router.post(
  "/",
  requirePermission("subjects.create"),
  validate(subjectValidation),
  subjectsController.create,
);
router.put(
  "/:id",
  requirePermission("subjects.edit"),
  subjectsController.update,
);
router.delete(
  "/:id",
  requirePermission("subjects.delete"),
  subjectsController.remove,
);
router.patch(
  "/:id/toggle-status",
  requirePermission("subjects.edit"),
  subjectsController.toggleStatus,
);

module.exports = router;
