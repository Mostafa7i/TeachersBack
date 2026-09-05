const express = require('express');
const notificationsController = require('../controllers/notifications.controller');
const { protect } = require('../middleware/auth.middleware');
const { requirePermission } = require('../middleware/rbac.middleware');

const router = express.Router();

router.use(protect);

router.get('/', notificationsController.getMyNotifications);
router.put('/read-all', notificationsController.markAllAsRead);
router.put('/:id/read', notificationsController.markAsRead);
router.post('/send-reminder', requirePermission(['schedules.edit', 'users.view']), notificationsController.sendReminder);

module.exports = router;
