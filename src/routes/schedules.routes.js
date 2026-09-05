const express = require("express");
const { body } = require("express-validator");
const schedulesController = require("../controllers/schedules.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

router.use(protect);

const scheduleValidation = [
  body("week").notEmpty().withMessage("الأسبوع مطلوب"),
  body("day").notEmpty().withMessage("اليوم مطلوب"),
  body("period").isInt({ min: 1, max: 8 }).withMessage("رقم الحصة بين 1 و 8"),
  body("subject").notEmpty().withMessage("المادة مطلوبة"),
];

router.get(
  "/week/:weekId",
  requirePermission(["schedules.view", "schedules.edit"]),
  schedulesController.getByWeek,
);
router.get(
  "/completion-stats",
  requirePermission(["schedules.view", "schedules.edit"]),
  schedulesController.getWeeklyPlanCompletion,
);
router.get("/teacher/me", schedulesController.getForTeacher);
router.get(
  "/teacher-timetable/:teacherId",
  requirePermission(["schedules.view", "schedules.edit", "users.view"]),
  schedulesController.getTeacherTimetable,
);
router.post(
  "/save-teacher-timetable",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.saveTeacherTimetable,
);
router.post(
  "/master-cell",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.saveMasterCell,
);

router.get(
  "/:id",
  requirePermission("schedules.view"),
  schedulesController.getById,
);

router.post(
  "/",
  requirePermission(["schedules.create", "schedules.edit"]),
  validate(scheduleValidation),
  schedulesController.create,
);

router.put(
  "/:id",
  requirePermission([
    "schedules.edit",
    "schedules.edit_title",
    "schedules.edit_homework",
    "schedules.edit_activities",
    "schedules.edit_notes",
  ]),
  schedulesController.update,
);

router.delete(
  "/:id",
  requirePermission("schedules.delete"),
  schedulesController.remove,
);
router.post(
  "/copy-week",
  requirePermission([
    "schedules.create",
    "schedules.copy_week",
    "schedules.edit",
  ]),
  schedulesController.copyWeek,
);

module.exports = router;
