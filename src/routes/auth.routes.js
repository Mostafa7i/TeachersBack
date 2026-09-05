const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

const router = express.Router();

// Rate limiting strictly for login endpoint
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 500 : 20,
  skipSuccessfulRequests: true, // Do not penalize successful logins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها، يرجى المحاولة بعد 15 دقيقة.',
  },
});

const loginValidation = [
  body('email').isEmail().withMessage('يرجى إدخال بريد إلكتروني صحيح'),
  body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
];

router.post('/login', loginLimiter, validate(loginValidation), authController.login);
router.post('/google', authController.googleAuth);
router.put('/complete-profile', protect, authController.completeProfile);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);
router.put('/change-password', protect, authController.changePassword);

module.exports = router;
