import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { groupAPI, userAPI } from '../utils/api';
import './GroupInfoModal.css';

const GroupInfoModal = ({ group, onClose, onGroupUpdated, onGroupLeft }) => {
  const { user } = useAuth();
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [info, setInfo] = useState('');
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState(null);
  const [removeError, setRemoveError] = useState('');

  const isAdmin = (group.admins || []).some((a) => (a._id || a) === user?.id);

  const handleLeaveGroup = async () => {
    setLeaving(true);
    setLeaveError('');
    try {
      await groupAPI.leaveGroup(group._id);
      onGroupLeft?.(group._id);
      onClose();
    } catch (err) {
      console.error('Leave group error:', err);
      setLeaveError('Failed to leave group. Please try again.');
      setLeaving(false);
    }
  };

  const handleRemoveMember = async (memberId) => {
    setRemovingId(memberId);
    setRemoveError('');
    try {
      const response = await groupAPI.removeMember(group._id, memberId);
      onGroupUpdated?.(response.data.group);
      setConfirmingRemoveId(null);
    } catch (err) {
      console.error('Remove member error:', err);
      setRemoveError(err.response?.data?.error || 'Failed to remove member. Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  const existingIds = new Set([
    ...(group.members || []).map((m) => m._id),
    ...(group.pendingMembers || []).map((m) => m._id),
  ]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await userAPI.getAllUsers();
      setUsers(response.data.filter((u) => !existingIds.has(u._id)));
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
      setUsers(response.data.filter((u) => !existingIds.has(u._id)));
    } catch (err) {
      console.error('Search users error:', err);
    }
  };

  const toggleUser = (u) => {
    setSelected((prev) =>
      prev.find((x) => x._id === u._id) ? prev.filter((x) => x._id !== u._id) : [...prev, u]
    );
  };

  const handleAddMembers = async () => {
    if (selected.length === 0) return;
    setAdding(true);
    setAddError('');
    try {
      const response = await groupAPI.addMembers(group._id, selected.map((u) => u._id));
      onGroupUpdated?.(response.data.group);

      const invited = selected.filter((u) => u.isPrivate || u.allowGroupAdd === 'approval');
      if (invited.length > 0) {
        setInfo(`${invited.map((u) => u.username).join(', ')} will need to accept an invite/request first.`);
      }
      setSelected([]);
      setShowAddMembers(false);
    } catch (err) {
      console.error('Add members error:', err);
      setAddError(err.response?.data?.error || 'Failed to add members. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const getMemberNote = (u) => {
    if (u.isPrivate) return { label: 'Invite', tone: 'invite' };
    if (u.allowGroupAdd === 'approval') return { label: 'Request', tone: 'request' };
    return null;
  };

  return (
    <div className="group-info-overlay" onClick={onClose}>
      <div className="group-info-modal" onClick={(e) => e.stopPropagation()}>
        {!showAddMembers ? (
          <>
            <div className="gi-header">
              <h2>Group Info</h2>
              <button onClick={onClose} className="close-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="gi-body">
              <div className="gi-avatar-section">
                {group.avatar ? (
                  <img src={group.avatar} alt={group.name} className="gi-avatar" />
                ) : (
                  <div className="gi-avatar-fallback">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </div>
                )}
                <h3>{group.name}</h3>
                {group.description && <p className="gi-desc">{group.description}</p>}
              </div>

              <div className="gi-section-header">
                <span>{(group.members || []).length} members</span>
                {isAdmin && (
                  <button
                    className="gi-add-btn"
                    onClick={() => { setShowAddMembers(true); loadUsers(); }}
                  >
                    + Add
                  </button>
                )}
              </div>

              {info && <p className="gi-info">{info}</p>}
              {removeError && <p className="gi-error">{removeError}</p>}

              <div className="gi-members-list">
                {(group.members || []).map((m) => {
                  const isSelf = m._id === user?.id;
                  const canRemove = isAdmin && !isSelf;
                  const isConfirming = confirmingRemoveId === m._id;
                  return (
                    <div key={m._id} className="gi-member-item">
                      <img src={m.avatar} alt={m.username} className="gi-member-avatar" />
                      <div className="gi-member-info">
                        <h4>{m.displayName || m.username}</h4>
                        <p>@{m.username}</p>
                      </div>
                      {group.admins?.some((a) => (a._id || a) === m._id) && (
                        <span className="gi-admin-badge">Admin</span>
                      )}
                      {canRemove && (
                        isConfirming ? (
                          <div className="gi-remove-confirm">
                            <button
                              className="gi-remove-confirm-btn"
                              onClick={() => handleRemoveMember(m._id)}
                              disabled={removingId === m._id}
                            >
                              {removingId === m._id ? 'Removing…' : 'Confirm'}
                            </button>
                            <button
                              className="gi-remove-cancel-btn"
                              onClick={() => setConfirmingRemoveId(null)}
                              disabled={removingId === m._id}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="gi-remove-btn"
                            title={`Remove ${m.displayName || m.username}`}
                            onClick={() => { setConfirmingRemoveId(m._id); setRemoveError(''); }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>

              {(group.pendingMembers || []).length > 0 && (
                <>
                  <div className="gi-section-header">
                    <span>Pending approval ({group.pendingMembers.length})</span>
                  </div>
                  <div className="gi-members-list">
                    {group.pendingMembers.map((m) => (
                      <div key={m._id} className="gi-member-item pending">
                        <img src={m.avatar} alt={m.username} className="gi-member-avatar" />
                        <div className="gi-member-info">
                          <h4>{m.displayName || m.username}</h4>
                          <p>@{m.username}</p>
                        </div>
                        <span className="cg-note cg-note-request">Pending</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="gi-danger-zone">
                {leaveError && <p className="gi-error">{leaveError}</p>}
                {!confirmingLeave ? (
                  <button className="gi-leave-btn" onClick={() => setConfirmingLeave(true)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Leave Group
                  </button>
                ) : (
                  <div className="gi-leave-confirm">
                    <p>Leave "{group.name}"? You won't be able to see the group's messages anymore.</p>
                    <div className="gi-leave-confirm-actions">
                      <button className="gi-cancel-leave-btn" onClick={() => setConfirmingLeave(false)} disabled={leaving}>
                        Cancel
                      </button>
                      <button className="gi-confirm-leave-btn" onClick={handleLeaveGroup} disabled={leaving}>
                        {leaving ? 'Leaving…' : 'Leave'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="gi-header">
              <button className="cg-back-btn" onClick={() => setShowAddMembers(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <h2>Add Members</h2>
              <button onClick={onClose} className="close-btn">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="gi-search">
              <input
                type="text"
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="gi-add-list">
              {loading ? (
                <div className="cg-loading"><div className="spinner"></div></div>
              ) : users.length === 0 ? (
                <div className="cg-empty">No users found</div>
              ) : (
                users.map((u) => {
                  const isSelected = selected.some((x) => x._id === u._id);
                  const note = getMemberNote(u);
                  return (
                    <div key={u._id} className={`cg-user-item ${isSelected ? 'selected' : ''}`} onClick={() => toggleUser(u)}>
                      <div className="cg-checkbox">{isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}</div>
                      <img src={u.avatar} alt={u.username} className="cg-avatar" />
                      <div className="cg-user-info">
                        <h4>{u.displayName || u.username}</h4>
                        <p>@{u.username}</p>
                      </div>
                      {note && <span className={`cg-note cg-note-${note.tone}`}>{note.label}</span>}
                    </div>
                  );
                })
              )}
            </div>

            {addError && <p className="gi-error gi-error-inline">{addError}</p>}

            <div className="cg-footer">
              <span className="cg-count">{selected.length} selected</span>
              <button className="cg-create-btn" disabled={selected.length === 0 || adding} onClick={handleAddMembers}>
                {adding ? 'Adding…' : 'Add to Group'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default GroupInfoModal;