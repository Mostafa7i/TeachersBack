const express = require("express");
const { body } = require("express-validator");
const weeksController = require("../controllers/weeks.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

router.use(protect);

const weekValidation = [
  body("weekNumber")
    .isInt({ min: 1 })
    .withMessage("رقم الأسبوع يجب أن يكون رقماً صحيحاً"),
  body("label").trim().notEmpty().withMessage("عنوان الأسبوع مطلوب"),
  body("startDate").isISO8601().withMessage("تاريخ البداية غير صالح"),
  body("endDate").isISO8601().withMessage("تاريخ النهاية غير صالح"),
];

router.get("/current", weeksController.getCurrent);
router.get("/", requirePermission("schedules.view"), weeksController.getAll);
router.get(
  "/:id",
  requirePermission("schedules.view"),
  weeksController.getById,
);
router.post(
  "/",
  requirePermission("schedules.create"),
  validate(weekValidation),
  weeksController.create,
);
router.put("/:id", requirePermission("schedules.edit"), weeksController.update);
router.delete(
  "/:id",
  requirePermission("schedules.delete"),
  weeksController.remove,
);

module.exports = router;
