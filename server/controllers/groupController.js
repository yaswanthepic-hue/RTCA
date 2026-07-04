const path = require('path');
const fs = require('fs');
const Group = require('../models/Group');
const GroupInvite = require('../models/GroupInvite');
const User = require('../models/User');
const Message = require('../models/Message');

const GROUP_POPULATE_FIELDS = 'username displayName avatar status lastSeen';

// Helper: populate a group for client consumption
const populateGroup = (query) =>
  query
    .populate('admin', GROUP_POPULATE_FIELDS)
    .populate('admins', GROUP_POPULATE_FIELDS)
    .populate('members', GROUP_POPULATE_FIELDS)
    .populate('pendingMembers', GROUP_POPULATE_FIELDS)
    .populate({
      path: 'lastMessage',
      populate: { path: 'sender', select: 'username avatar' }
    });

// Helper: post a "X has joined the group" system message into a group's chat
// and broadcast it live to anyone with the group open.
const postJoinSystemMessage = async (io, group, user) => {
  try {
    const name = user.displayName || user.username;
    const message = new Message({
      sender: user._id,
      group: group._id,
      content: `${name} has joined the group`,
      messageType: 'system'
    });
    await message.save();
    await message.populate('sender', 'username displayName avatar');

    group.lastMessage = message._id;
    await group.save();

    if (io) {
      io.to(`group:${group._id}`).emit('receiveGroupMessage', message);
    }
  } catch (error) {
    console.error('Post join system message error:', error);
  }
};

// ─── Create a new group ──────────────────────────────────────────────────
// Determines, per invited user, whether they:
//  - get added directly (public account, no group-add restriction)
//  - get a "request" (public account, but has group-add restriction -> approval needed)
//  - get an "invite" (private account -> must accept an invite to join + chat)
exports.createGroup = async (req, res) => {
  try {
    const { name, description, avatar, memberIds = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const uniqueIds = [...new Set(memberIds.map(String))].filter(
      (id) => id !== req.user._id.toString()
    );

    const users = await User.find({ _id: { $in: uniqueIds } });

    const directMembers = [req.user._id];
    const directUsers = [];
    const pendingMembers = [];
    const invites = [];

    for (const u of users) {
      if (u.isPrivate) {
        invites.push({
          group: null,
          invitedBy: req.user._id,
          recipient: u._id,
          type: 'invite',
          status: 'pending'
        });
      } else if (u.allowGroupAdd === 'approval') {
        pendingMembers.push(u._id);
        invites.push({
          group: null,
          invitedBy: req.user._id,
          recipient: u._id,
          type: 'request',
          status: 'pending'
        });
      } else {
        directMembers.push(u._id);
        directUsers.push(u);
      }
    }

    const group = new Group({
      name: name.trim(),
      description: description || '',
      avatar: avatar || '',
      admin: req.user._id,
      admins: [req.user._id],
      members: directMembers,
      pendingMembers
    });

    await group.save();

    if (invites.length > 0) {
      const docs = invites.map((inv) => ({ ...inv, group: group._id }));
      await GroupInvite.insertMany(docs);
    }

    const io = req.app.get('io');

    for (const u of directUsers) {
      await postJoinSystemMessage(io, group, u);
    }

    const populated = await populateGroup(Group.findById(group._id));

    if (io) {
      directMembers
        .filter((id) => id.toString() !== req.user._id.toString())
        .forEach((id) => io.to(id.toString()).emit('groupAdded', populated));

      users.forEach((u) => {
        if (u.isPrivate || u.allowGroupAdd === 'approval') {
          io.to(u._id.toString()).emit('groupInviteReceived', { groupId: group._id, groupName: group.name });
        }
      });
    }

    res.status(201).json({ group: populated });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Get all groups current user belongs to ─────────────────────────────
exports.getGroups = async (req, res) => {
  try {
    const groups = await populateGroup(
      Group.find({ members: req.user._id }).sort({ updatedAt: -1 })
    );
    res.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Get single group ────────────────────────────────────────────────────
exports.getGroupById = async (req, res) => {
  try {
    const group = await populateGroup(Group.findById(req.params.groupId));
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some((m) => m._id.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    res.json({ group });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Get group messages ───────────────────────────────────────────────────
exports.getGroupMessages = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    const messages = await Message.find({ group: group._id })
      .populate('sender', 'username displayName avatar')
      .sort({ createdAt: 1 });

    res.json({ messages });
  } catch (error) {
    console.error('Get group messages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Add member(s) to existing group ─────────────────────────────────────
// Applies the same permission logic as creation.
exports.addMembers = async (req, res) => {
  try {
    const { memberIds = [] } = req.body;
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isAdmin = group.admins.some((id) => id.toString() === req.user._id.toString());
    if (!isAdmin) return res.status(403).json({ error: 'Only group admins can add members' });

    const existingIds = new Set([
      ...group.members.map(String),
      ...group.pendingMembers.map(String)
    ]);

    const uniqueIds = [...new Set(memberIds.map(String))].filter((id) => !existingIds.has(id));
    const users = await User.find({ _id: { $in: uniqueIds } });

    const addedDirectly = [];
    const newInvites = [];

    for (const u of users) {
      if (u.isPrivate) {
        newInvites.push({
          group: group._id,
          invitedBy: req.user._id,
          recipient: u._id,
          type: 'invite',
          status: 'pending'
        });
      } else if (u.allowGroupAdd === 'approval') {
        group.pendingMembers.push(u._id);
        newInvites.push({
          group: group._id,
          invitedBy: req.user._id,
          recipient: u._id,
          type: 'request',
          status: 'pending'
        });
      } else {
        group.members.push(u._id);
        addedDirectly.push(u);
      }
    }

    await group.save();
    if (newInvites.length) await GroupInvite.insertMany(newInvites);

    const io = req.app.get('io');

    for (const u of addedDirectly) {
      await postJoinSystemMessage(io, group, u);
    }

    const populated = await populateGroup(Group.findById(group._id));

    if (io) {
      addedDirectly.forEach((u) => io.to(u._id.toString()).emit('groupAdded', populated));
      users.forEach((u) => {
        if (u.isPrivate || u.allowGroupAdd === 'approval') {
          io.to(u._id.toString()).emit('groupInviteReceived', { groupId: group._id, groupName: group.name });
        }
      });
      group.members.forEach((m) =>
        io.to(m.toString()).emit('groupUpdated', populated)
      );
    }

    res.json({ group: populated });
  } catch (error) {
    console.error('Add members error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Remove a member from the group (admin only) ──────────────────────────
exports.removeMember = async (req, res) => {
  try {
    const { groupId, memberId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isAdmin = group.admins.some((id) => id.toString() === req.user._id.toString());
    if (!isAdmin) return res.status(403).json({ error: 'Only group admins can remove members' });

    if (memberId === req.user._id.toString()) {
      return res.status(400).json({ error: 'Use "Leave Group" to remove yourself' });
    }

    const isMember = group.members.some((m) => m.toString() === memberId);
    if (!isMember) return res.status(404).json({ error: 'User is not a member of this group' });

    const removedUser = await User.findById(memberId);

    group.members = group.members.filter((m) => m.toString() !== memberId);
    group.admins = group.admins.filter((a) => a.toString() !== memberId);
    group.pendingMembers = group.pendingMembers.filter((p) => p.toString() !== memberId);
    await group.save();

    const io = req.app.get('io');

    if (removedUser) {
      const name = removedUser.displayName || removedUser.username;
      const message = new Message({
        sender: req.user._id,
        group: group._id,
        content: `${name} was removed from the group`,
        messageType: 'system'
      });
      await message.save();
      await message.populate('sender', 'username displayName avatar');

      group.lastMessage = message._id;
      await group.save();

      if (io) {
        io.to(`group:${group._id}`).emit('receiveGroupMessage', message);
      }
    }

    const populated = await populateGroup(Group.findById(group._id));

    if (io) {
      group.members.forEach((m) => io.to(m.toString()).emit('groupUpdated', populated));
      io.to(memberId).emit('removedFromGroup', { groupId: group._id.toString(), groupName: group.name });
    }

    res.json({ group: populated });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Leave group ──────────────────────────────────────────────────────────
exports.leaveGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    group.members = group.members.filter((m) => m.toString() !== req.user._id.toString());
    group.admins = group.admins.filter((a) => a.toString() !== req.user._id.toString());
    await group.save();

    const populated = await populateGroup(Group.findById(group._id));

    const io = req.app.get('io');
    if (io) {
      group.members.forEach((m) => io.to(m.toString()).emit('groupUpdated', populated));
    }

    res.json({ message: 'Left group' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.postJoinSystemMessage = postJoinSystemMessage;

// ─── Pin a message in a group chat ────────────────────────────────────────
exports.pinGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    const message = await Message.findOne({ _id: messageId, group: groupId });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    message.isPinned = true;
    await message.save();

    const io = req.app.get('io');
    if (io) io.to(`group:${groupId}`).emit('groupMessageUpdate', message);

    res.json({ message: 'Message pinned successfully', data: message });
  } catch (error) {
    console.error('Pin group message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Unpin a message in a group chat ──────────────────────────────────────
exports.unpinGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some((m) => m.toString() === req.user._id.toString());
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    const message = await Message.findOne({ _id: messageId, group: groupId });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    message.isPinned = false;
    await message.save();

    const io = req.app.get('io');
    if (io) io.to(`group:${groupId}`).emit('groupMessageUpdate', message);

    res.json({ message: 'Message unpinned successfully', data: message });
  } catch (error) {
    console.error('Unpin group message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// ─── Delete a message in a group chat (sender only) ───────────────────────
exports.deleteGroupMessage = async (req, res) => {
  try {
    const { groupId, messageId } = req.params;

    const message = await Message.findOne({
      _id: messageId,
      group: groupId,
      sender: req.user._id
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    if (message.fileUrl) {
      const filePath = path.join(__dirname, '..', message.fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await Message.deleteOne({ _id: messageId });

    const io = req.app.get('io');
    if (io) io.to(`group:${groupId}`).emit('groupMessageDeleted', { messageId, groupId });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('Delete group message error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};