const express = require('express');
const auth = require('../middleware/auth');
const groupController = require('../controllers/groupController');

const router = express.Router();

router.post('/', auth, groupController.createGroup);
router.get('/', auth, groupController.getGroups);
router.get('/:groupId', auth, groupController.getGroupById);
router.get('/:groupId/messages', auth, groupController.getGroupMessages);
router.post('/:groupId/members', auth, groupController.addMembers);
router.delete('/:groupId/members/:memberId', auth, groupController.removeMember);
router.post('/:groupId/leave', auth, groupController.leaveGroup);
router.delete('/:groupId/messages/:messageId', auth, groupController.deleteGroupMessage);

module.exports = router;