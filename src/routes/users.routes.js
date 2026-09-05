const express = require("express");
const { body } = require("express-validator");
const usersController = require("../controllers/users.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

router.use(protect);

const userValidation = [
  body("name").trim().notEmpty().withMessage("اسم المستخدم مطلوب"),
  body("email").isEmail().withMessage("البريد الإلكتروني غير صحيح"),
  body("password")
    .if(body("password").exists())
    .isLength({ min: 6 })
    .withMessage("كلمة المرور 6 أحرف على الأقل"),
  body("role").notEmpty().withMessage("الدور مطلوب"),
];

router.get(
  "/teachers",
  requirePermission(["users.view", "schedules.view"]),
  usersController.getTeachers,
);
router.get("/", requirePermission("users.view"), usersController.getAll);
router.get("/:id", requirePermission("users.view"), usersController.getById);
router.post(
  "/",
  requirePermission("users.create"),
  validate(userValidation),
  usersController.create,
);
router.put("/:id", requirePermission("users.edit"), usersController.update);
router.delete(
  "/:id",
  requirePermission("users.delete"),
  usersController.remove,
);
router.patch(
  "/:id/toggle-status",
  requirePermission("users.edit"),
  usersController.toggleStatus,
);
router.patch(
  "/:id/reset-password",
  requirePermission("users.edit"),
  usersController.resetPassword,
);

module.exports = router;
