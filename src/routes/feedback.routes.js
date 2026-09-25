const express = require("express");
const router = express.Router();
const feedbackController = require("../controllers/feedback.controller");
const { protect } = require("../middleware/auth.middleware");

// All feedback routes require authentication
router.use(protect);

router.post("/", feedbackController.createFeedback);
router.get("/me", feedbackController.getMyFeedback);
router.get("/all", feedbackController.getAllFeedback);
router.put("/:id/reply", feedbackController.replyFeedback);
router.delete("/:id", feedbackController.deleteFeedback);

module.exports = router;
