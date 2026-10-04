const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { suggestLessonPlan } = require('../controllers/ai.controller');

router.post('/suggest-lesson', protect, suggestLessonPlan);

module.exports = router;
