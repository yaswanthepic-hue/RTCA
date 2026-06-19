const mongoose = require('mongoose');

const groupInviteSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // 'invite' -> shown as an invite link the recipient can accept to join (used for private accounts
  //             or users with group-add restriction).
  // 'request' -> a request that the group admin/inviter can see was sent (mirrors message requests UI)
  type: {
    type: String,
    enum: ['invite', 'request'],
    default: 'invite'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  }
}, {
  timestamps: true
});

groupInviteSchema.index({ group: 1, recipient: 1 });

module.exports = mongoose.model('GroupInvite', groupInviteSchema);
