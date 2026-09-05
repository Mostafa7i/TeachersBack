const express = require("express");
const { body } = require("express-validator");
const rolesController = require("../controllers/roles.controller");
const { protect } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/rbac.middleware");
const validate = require("../middleware/validate.middleware");

const router = express.Router();

router.use(protect);

const roleValidation = [
  body("name").trim().notEmpty().withMessage("اسم الدور مطلوب"),
];

router.get("/", requirePermission("roles.view"), rolesController.getAll);
router.get("/:id", requirePermission("roles.view"), rolesController.getById);
router.post(
  "/",
  requirePermission("roles.create"),
  validate(roleValidation),
  rolesController.create,
);
router.put("/:id", requirePermission("roles.edit"), rolesController.update);
router.delete(
  "/:id",
  requirePermission("roles.delete"),
  rolesController.remove,
);

module.exports = router;
