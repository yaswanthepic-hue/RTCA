import { useState, useEffect } from 'react';
import { userAPI, groupAPI } from '../utils/api';
import './CreateGroupModal.css';

const CreateGroupModal = ({ onClose, onGroupCreated }) => {
  const [step, setStep] = useState(1); // 1 = pick members, 2 = name group
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await userAPI.getAllUsers();
      setUsers(response.data);
    } catch (err) {
      console.error('Load users error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadUsers();
      return;
    }
    try {
      const response = await userAPI.searchUsers(query);
      setUsers(response.data);
    } catch (err) {
      console.error('Search users error:', err);
    }
  };

  const toggleUser = (user) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u._id === user._id);
      if (exists) return prev.filter((u) => u._id !== user._id);
      return [...prev, user];
    });
  };

  const removeSelected = (userId) => {
    setSelectedUsers((prev) => prev.filter((u) => u._id !== userId));
  };

  const handleNext = () => {
    if (selectedUsers.length === 0) return;
    setStep(2);
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Please enter a group name');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const response = await groupAPI.createGroup({
        name: groupName.trim(),
        description: groupDescription.trim(),
        memberIds: selectedUsers.map((u) => u._id),
      });
      onGroupCreated(response.data.group);
    } catch (err) {
      console.error('Create group error:', err);
      setError(err.response?.data?.error || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  // Helper badge describing what'll happen when this user is added
  const getMemberNote = (user) => {
    if (user.isPrivate) return { label: 'Invite', tone: 'invite' };
    if (user.allowGroupAdd === 'approval') return { label: 'Request', tone: 'request' };
    return null;
  };

  return (
    <div className="create-group-overlay" onClick={onClose}>
      <div className="create-group-modal" onClick={(e) => e.stopPropagation()}>
        {step === 1 ? (
          <>
            <div className="cg-header">
              <h2>New Group</h2>
              <button onClick={onClose} className="close-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {selectedUsers.length > 0 && (
              <div className="cg-selected-row">
                {selectedUsers.map((u) => (
                  <div key={u._id} className="cg-selected-chip">
                    <img src={u.avatar} alt={u.username} />
                    <span>{u.username}</span>
                    <button onClick={() => removeSelected(u._id)} aria-label="remove">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="cg-search">
              <input
                type="text"
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="cg-list">
              {loading ? (
                <div className="cg-loading">
                  <div className="spinner"></div>
                </div>
              ) : users.length === 0 ? (
                <div className="cg-empty">No users found</div>
              ) : (
                users.map((user) => {
                  const isSelected = selectedUsers.some((u) => u._id === user._id);
                  const note = getMemberNote(user);
                  return (
                    <div
                      key={user._id}
                      className={`cg-user-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleUser(user)}
                    >
                      <div className="cg-checkbox">{isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}</div>
                      <img src={user.avatar} alt={user.username} className="cg-avatar" />
                      <div className="cg-user-info">
                        <h4>{user.displayName || user.username}</h4>
                        <p>@{user.username}</p>
                      </div>
                      {note && <span className={`cg-note cg-note-${note.tone}`}>{note.label}</span>}
                    </div>
                  );
                })
              )}
            </div>

            <div className="cg-footer">
              <span className="cg-count">{selectedUsers.length} selected</span>
              <button className="cg-next-btn" disabled={selectedUsers.length === 0} onClick={handleNext}>
                Next
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="cg-header">
              <button className="cg-back-btn" onClick={() => setStep(1)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <h2>Group Details</h2>
              <button onClick={onClose} className="close-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="cg-details-body">
              <div className="cg-avatar-placeholder">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>

              <input
                type="text"
                placeholder="Group name"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="cg-name-input"
                autoFocus
                maxLength={50}
              />
              <textarea
                placeholder="Group description (optional)"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                className="cg-desc-input"
                maxLength={150}
                rows={3}
              />

              <div className="cg-members-preview">
                <p className="cg-members-label">Members</p>
                <div className="cg-members-grid">
                  {selectedUsers.map((u) => {
                    const note = getMemberNote(u);
                    return (
                      <div key={u._id} className="cg-member-pill">
                        <img src={u.avatar} alt={u.username} />
                        <span>{u.username}</span>
                        {note && <span className={`cg-note cg-note-${note.tone}`}>{note.label}</span>}
                      </div>
                    );
                  })}
                </div>
                {selectedUsers.some((u) => u.isPrivate || u.allowGroupAdd === 'approval') && (
                  <p className="cg-hint">
                    Members marked <strong>Invite</strong> have private accounts — they'll receive an invite to join.
                    Members marked <strong>Request</strong> restrict group adds — they'll see a request to approve.
                  </p>
                )}
              </div>

              {error && <p className="cg-error">{error}</p>}
            </div>

            <div className="cg-footer">
              <button className="cg-create-btn" disabled={creating || !groupName.trim()} onClick={handleCreate}>
                {creating ? 'Creating…' : 'Create Group'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CreateGroupModal;
