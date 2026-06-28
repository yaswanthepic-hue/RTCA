const express = require('express');
const auth = require('../middleware/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.getMe);
router.put('/profile', auth, authController.updateProfile);
router.post('/upload-avatar', auth, authController.uploadAvatar);
router.post('/block/:userId', auth, authController.blockUser);
router.post('/unblock/:userId', auth, authController.unblockUser);
router.get('/blocked', auth, authController.getBlockedUsers);
router.post('/pin-chat/:userId', auth, authController.pinChat);
router.post('/unpin-chat/:userId', auth, authController.unpinChat);
router.post('/star-message/:messageId', auth, authController.starMessage);
router.post('/unstar-message/:messageId', auth, authController.unstarMessage);
router.get('/starred-messages', auth, authController.getStarredMessages);
router.post('/logout', auth, authController.logout);

module.exports = router;