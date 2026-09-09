const express = require("express");
const { body } = require("express-validator");
const multer = require("multer");
const schedulesController = require("../controllers/schedules.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf")
    ) {
      cb(null, true);
    } else {
      cb(new Error("يرجى رفع ملف بصيغة PDF فقط"));
    }
  },
});

router.use(protect);

const scheduleValidation = [
  body("week").notEmpty().withMessage("الأسبوع مطلوب"),
  body("day").notEmpty().withMessage("اليوم مطلوب"),
  body("period").isInt({ min: 1, max: 8 }).withMessage("رقم الحصة بين 1 و 8"),
  body("subject").notEmpty().withMessage("المادة مطلوبة"),
];

// ═════════════════════════════════════════════════════════════════════════════
// 1. SPECIFIC / STATIC ROUTES (Must come before parameter routes like /:id)
// ═════════════════════════════════════════════════════════════════════════════

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
router.get("/available-timetables", schedulesController.getAvailableTimetables);
router.post("/claim-timetable", schedulesController.claimTimetable);
router.post(
  "/assign-timetable-to-teacher",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.assignTimetableToTeacher,
);
router.post(
  "/toggle-timetable-claimed",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.toggleTimetableClaimed,
);
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
router.post(
  "/swap-period",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.swapPeriod,
);
router.post("/set-class-subject", schedulesController.setClassSubject);
router.post(
  "/copy-week",
  requirePermission([
    "schedules.create",
    "schedules.copy_week",
    "schedules.edit",
  ]),
  schedulesController.copyWeek,
);
router.post(
  "/bulk-fill-grade",
  requirePermission([
    "schedules.edit",
    "schedules.edit_title",
    "schedules.edit_homework",
  ]),
  schedulesController.bulkFillGrade,
);
router.post(
  "/import-pdf",
  requirePermission(["schedules.create", "schedules.edit"]),
  pdfUpload.single("file"),
  schedulesController.importPdfTimetables,
);
router.post(
  "/confirm-import-pdf",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.confirmImportPdf,
);

// ═════════════════════════════════════════════════════════════════════════════
// 2. TIMETABLE TEMPLATES (Vacant Slots) ROUTES
// ═════════════════════════════════════════════════════════════════════════════

router.get("/templates", schedulesController.getTemplates);
router.post(
  "/templates",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.createTemplate,
);
router.get("/templates/:id", schedulesController.getTemplateById);
router.put(
  "/templates/:id",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.updateTemplate,
);
router.put(
  "/templates/:id/entries",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.saveTemplateEntries,
);
router.delete(
  "/templates/:id",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.deleteTemplate,
);
router.post("/templates/:id/claim", schedulesController.claimTemplate);
router.post(
  "/templates/:id/assign",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.assignTemplateToTeacher,
);
router.post(
  "/templates/:id/unclaim",
  requirePermission(["schedules.create", "schedules.edit"]),
  schedulesController.unclaimTemplate,
);

// ═════════════════════════════════════════════════════════════════════════════
// 3. GENERIC ROOT & PARAMETER ROUTES (/:id) - MUST BE LAST
// ═════════════════════════════════════════════════════════════════════════════

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

module.exports = router;
