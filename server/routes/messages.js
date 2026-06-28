const express = require('express');
const auth = require('../middleware/auth');
const upload = require('../config/upload');
const messageController = require('../controllers/messageController');

const router = express.Router();

router.get('/conversation/:userId', auth, messageController.getConversation);
router.get('/conversations', auth, messageController.getConversations);
router.put('/conversation/:userId/read', auth, messageController.markConversationRead);
router.put('/:messageId/read', auth, messageController.markMessageRead);
router.post('/upload', auth, upload.single('file'), messageController.uploadFile);
router.post('/:messageId/pin', auth, messageController.pinMessage);
router.post('/:messageId/unpin', auth, messageController.unpinMessage);
router.get('/conversation/:userId/pinned', auth, messageController.getPinnedMessages);
router.get('/conversation/:userId/media', auth, messageController.getSharedMedia);
router.get('/unread-count', auth, messageController.getUnreadCount);
router.get('/unread-per-conversation', auth, messageController.getUnreadPerConversation);
router.delete('/:messageId', auth, messageController.deleteMessage);

module.exports = router;