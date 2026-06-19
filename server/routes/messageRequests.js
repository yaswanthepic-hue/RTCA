const express = require('express');
const MessageRequest = require('../models/MessageRequest');
const GroupInvite = require('../models/GroupInvite');
const Group = require('../models/Group');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Send message request
router.post('/send/:recipientId', auth, async (req, res) => {
  try {
    const { recipientId } = req.params;
    const { message } = req.body;

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if recipient is private
    if (!recipient.isPrivate) {
      return res.status(400).json({ error: 'User is not private, no request needed' });
    }

    // Check if request already exists
    const existingRequest = await MessageRequest.findOne({
      sender: req.user._id,
      recipient: recipientId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Request already sent' });
    }

    // Create request
    const messageRequest = new MessageRequest({
      sender: req.user._id,
      recipient: recipientId,
      message: message || '',
      status: 'pending'
    });

    await messageRequest.save();
    await messageRequest.populate('sender', 'username displayName avatar');
    await messageRequest.populate('recipient', 'username displayName avatar');

    res.status(201).json({ request: messageRequest });
  } catch (error) {
    console.error('Send message request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get pending requests (received)
router.get('/pending', auth, async (req, res) => {
  try {
    const requests = await MessageRequest.find({
      recipient: req.user._id,
      status: 'pending'
    })
      .populate('sender', 'username displayName avatar status')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get sent requests
router.get('/sent', auth, async (req, res) => {
  try {
    const requests = await MessageRequest.find({
      sender: req.user._id
    })
      .populate('recipient', 'username displayName avatar status')
      .sort({ createdAt: -1 });

    res.json({ requests });
  } catch (error) {
    console.error('Get sent requests error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept request
router.post('/accept/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await MessageRequest.findOne({
      _id: requestId,
      recipient: req.user._id,
      status: 'pending'
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.status = 'accepted';
    await request.save();

    res.json({ message: 'Request accepted', request });
  } catch (error) {
    console.error('Accept request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reject request
router.post('/reject/:requestId', auth, async (req, res) => {
  try {
    const { requestId } = req.params;

    const request = await MessageRequest.findOne({
      _id: requestId,
      recipient: req.user._id,
      status: 'pending'
    });

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.status = 'rejected';
    await request.save();

    res.json({ message: 'Request rejected', request });
  } catch (error) {
    console.error('Reject request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Group invites/requests (received by current user) ──────────────────
router.get('/group-invites', auth, async (req, res) => {
  try {
    const invites = await GroupInvite.find({
      recipient: req.user._id,
      status: 'pending'
    })
      .populate('group', 'name avatar description members')
      .populate('invitedBy', 'username displayName avatar')
      .sort({ createdAt: -1 });

    res.json({ invites });
  } catch (error) {
    console.error('Get group invites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Accept a group invite (private account) or group add request (approval-restricted account)
router.post('/group-invites/:inviteId/accept', auth, async (req, res) => {
  try {
    const invite = await GroupInvite.findOne({
      _id: req.params.inviteId,
      recipient: req.user._id,
      status: 'pending'
    });

    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    const group = await Group.findById(invite.group);
    if (!group) return res.status(404).json({ error: 'Group no longer exists' });

    invite.status = 'accepted';
    await invite.save();

    // Move user from pendingMembers (if 'request' type) to members
    group.pendingMembers = group.pendingMembers.filter(
      (id) => id.toString() !== req.user._id.toString()
    );
    if (!group.members.some((id) => id.toString() === req.user._id.toString())) {
      group.members.push(req.user._id);
    }
    await group.save();

    const populated = await Group.findById(group._id)
      .populate('admin', 'username displayName avatar status lastSeen')
      .populate('admins', 'username displayName avatar status lastSeen')
      .populate('members', 'username displayName avatar status lastSeen')
      .populate('pendingMembers', 'username displayName avatar status lastSeen');

    const io = req.app.get('io');
    if (io) {
      io.to(req.user._id.toString()).emit('groupAdded', populated);
      group.members.forEach((m) => io.to(m.toString()).emit('groupUpdated', populated));
    }

    res.json({ message: 'Joined group', group: populated });
  } catch (error) {
    console.error('Accept group invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reject/decline a group invite or request
router.post('/group-invites/:inviteId/reject', auth, async (req, res) => {
  try {
    const invite = await GroupInvite.findOne({
      _id: req.params.inviteId,
      recipient: req.user._id,
      status: 'pending'
    });

    if (!invite) return res.status(404).json({ error: 'Invite not found' });

    invite.status = 'rejected';
    await invite.save();

    // If it was a pending-approval add, remove from group.pendingMembers
    const group = await Group.findById(invite.group);
    if (group) {
      group.pendingMembers = group.pendingMembers.filter(
        (id) => id.toString() !== req.user._id.toString()
      );
      await group.save();
    }

    res.json({ message: 'Invite declined' });
  } catch (error) {
    console.error('Reject group invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
