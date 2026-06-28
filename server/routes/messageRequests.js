const express = require('express');
const auth = require('../middleware/auth');
const messageRequestController = require('../controllers/messageRequestController');

const router = express.Router();

router.post('/send/:recipientId', auth, messageRequestController.sendRequest);
router.get('/pending', auth, messageRequestController.getPendingRequests);
router.get('/sent', auth, messageRequestController.getSentRequests);
router.post('/accept/:requestId', auth, messageRequestController.acceptRequest);
router.post('/reject/:requestId', auth, messageRequestController.rejectRequest);
router.get('/group-invites', auth, messageRequestController.getGroupInvites);
router.post('/group-invites/:inviteId/accept', auth, messageRequestController.acceptGroupInvite);
router.post('/group-invites/:inviteId/reject', auth, messageRequestController.rejectGroupInvite);

module.exports = router;