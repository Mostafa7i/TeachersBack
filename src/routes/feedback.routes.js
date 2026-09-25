const express = require('express');
const { default: feedbackController } = require('../controllers/feedback.controller');
const router = express.Router();
const { protect } = require("../middleware/auth.middleware");


router.post("/", protect, feedbackController.createFeedback);
router.get("/me", protect, feedbackController.getMyFeedback);
router.get("/all", protect, feedbackController.getAllFeedback);
router.put("/:id/reply", protect, feedbackController.replyToFeedback);
router.delete("/:id", protect, feedbackController.deleteFeedback);

module.exports = router;
