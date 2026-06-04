import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../utils/api';
import './Profile.css';

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [activeTab, setActiveTab] = useState('profile');
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '');
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false);
  const [allowGroupAdd, setAllowGroupAdd] = useState(user?.allowGroupAdd || 'everyone');
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [starredMessages, setStarredMessages] = useState([]);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', msg }
  const [loading, setLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    if (activeTab === 'blocked') loadBlockedUsers();
    else if (activeTab === 'starred') loadStarredMessages();
  }, [activeTab]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const loadBlockedUsers = async () => {
    try {
      const res = await authAPI.getBlockedUsers();
      setBlockedUsers(res.data.blockedUsers);
    } catch { showToast('error', 'Failed to load blocked users'); }
  };

  const loadStarredMessages = async () => {
    try {
      const res = await authAPI.getStarredMessages();
      setStarredMessages(res.data.messages);
    } catch { showToast('error', 'Failed to load starred messages'); }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('error', 'Image must be under 5MB'); return; }

    try {
      setLoading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          setAvatarPreview(reader.result);
          await authAPI.uploadAvatar(reader.result);
          showToast('success', 'Avatar updated!');
          setTimeout(() => window.location.reload(), 1200);
        } catch { showToast('error', 'Failed to upload avatar'); setAvatarPreview(null); }
      };
      reader.readAsDataURL(file);
    } finally { setLoading(false); }
  };

  const handleSaveProfile = async () => {
    try {
      setLoading(true);
      await authAPI.updateProfile({ displayName });
      showToast('success', 'Profile saved!');
    } catch { showToast('error', 'Failed to save profile'); }
    finally { setLoading(false); }
  };

  const handleSavePrivacy = async () => {
    try {
      setLoading(true);
      await authAPI.updateProfile({ isPrivate, allowGroupAdd });
      showToast('success', 'Privacy settings saved!');
    } catch { showToast('error', 'Failed to save settings'); }
    finally { setLoading(false); }
  };

  const handleUnblock = async (userId) => {
    try {
      await authAPI.unblockUser(userId);
      setBlockedUsers(prev => prev.filter(u => u._id !== userId));
      showToast('success', 'User unblocked');
    } catch { showToast('error', 'Failed to unblock user'); }
  };

  const handleUnstar = async (messageId) => {
    try {
      await authAPI.unstarMessage(messageId);
      setStarredMessages(prev => prev.filter(m => m._id !== messageId));
      showToast('success', 'Message unstarred');
    } catch { showToast('error', 'Failed to unstar'); }
  };

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
      </svg>
    )},
    { id: 'privacy', label: 'Privacy', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    )},
    { id: 'blocked', label: 'Blocked', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
    )},
    { id: 'starred', label: 'Starred', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>
    )},
  ];

  return (
    <div className="profile-page">
      {/* Toast */}
      {toast && (
        <div className={`profile-toast profile-toast--${toast.type}`}>
          {toast.type === 'success' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
          {toast.msg}
        </div>
      )}

      {/* Sidebar */}
      <aside className="profile-sidebar">
        <button className="profile-back-btn" onClick={() => navigate('/chat')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Back
        </button>

        {/* Avatar */}
        <div className="profile-avatar-section" onClick={() => fileInputRef.current?.click()}>
          <div className="profile-avatar-wrap">
            <img src={avatarPreview || user?.avatar} alt={user?.username} className="profile-avatar-img" />
            <div className="profile-avatar-overlay">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
          </div>
          <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" style={{ display: 'none' }} />
          <h2 className="profile-sidebar-name">{user?.displayName || user?.username}</h2>
          <p className="profile-sidebar-username">@{user?.username}</p>
          <p className="profile-sidebar-email">{user?.email}</p>
        </div>

        {/* Nav */}
        <nav className="profile-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`profile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Logout */}
        <button className="profile-logout-btn" onClick={handleLogout}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </aside>

      {/* Content */}
      <main className="profile-main">

        {/* ── Profile Tab ── */}
        {activeTab === 'profile' && (
          <div className="profile-section" key="profile">
            <div className="profile-section-header">
              <h1>Edit Profile</h1>
              <p>Update your personal information</p>
            </div>

            <div className="profile-card">
              <div className="profile-field">
                <label>Username</label>
                <div className="profile-input-wrap">
                  <input type="text" value={user?.username} disabled className="profile-input profile-input--disabled" />
                  <span className="profile-input-badge">Locked</span>
                </div>
              </div>
              <div className="profile-field">
                <label>Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  className="profile-input"
                  placeholder="How should others see you?"
                />
              </div>
              <div className="profile-field">
                <label>Email</label>
                <div className="profile-input-wrap">
                  <input type="email" value={user?.email} disabled className="profile-input profile-input--disabled" />
                  <span className="profile-input-badge">Locked</span>
                </div>
              </div>
              <button className="profile-save-btn" onClick={handleSaveProfile} disabled={loading}>
                {loading ? <span className="btn-spinner" /> : null}
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* ── Privacy Tab ── */}
        {activeTab === 'privacy' && (
          <div className="profile-section" key="privacy">
            <div className="profile-section-header">
              <h1>Privacy Settings</h1>
              <p>Control who can contact and interact with you</p>
            </div>

            <div className="profile-card">
              <div className="privacy-row">
                <div className="privacy-row-info">
                  <h3>Private Account</h3>
                  <p>Users must send a request before messaging you</p>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} />
                  <span className="toggle-track"><span className="toggle-thumb" /></span>
                </label>
              </div>

              <div className="privacy-row">
                <div className="privacy-row-info">
                  <h3>Group Add Permission</h3>
                  <p>Control who can add you to group chats</p>
                </div>
                <select value={allowGroupAdd} onChange={e => setAllowGroupAdd(e.target.value)} className="profile-select">
                  <option value="everyone">Everyone</option>
                  <option value="approval">Require Approval</option>
                </select>
              </div>

              <button className="profile-save-btn" onClick={handleSavePrivacy} disabled={loading}>
                {loading ? <span className="btn-spinner" /> : null}
                {loading ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* ── Blocked Tab ── */}
        {activeTab === 'blocked' && (
          <div className="profile-section" key="blocked">
            <div className="profile-section-header">
              <h1>Blocked Users</h1>
              <p>{blockedUsers.length} user{blockedUsers.length !== 1 ? 's' : ''} blocked</p>
            </div>

            {blockedUsers.length === 0 ? (
              <div className="profile-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                </svg>
                <p>No blocked users</p>
              </div>
            ) : (
              <div className="profile-list">
                {blockedUsers.map(u => (
                  <div key={u._id} className="profile-list-item">
                    <img src={u.avatar} alt={u.username} className="profile-list-avatar" />
                    <div className="profile-list-info">
                      <span className="profile-list-name">{u.displayName || u.username}</span>
                      <span className="profile-list-sub">@{u.username}</span>
                    </div>
                    <button className="profile-action-btn profile-action-btn--danger" onClick={() => handleUnblock(u._id)}>
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Starred Tab ── */}
        {activeTab === 'starred' && (
          <div className="profile-section" key="starred">
            <div className="profile-section-header">
              <h1>Starred Messages</h1>
              <p>{starredMessages.length} saved message{starredMessages.length !== 1 ? 's' : ''}</p>
            </div>

            {starredMessages.length === 0 ? (
              <div className="profile-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
                <p>No starred messages yet</p>
              </div>
            ) : (
              <div className="starred-list">
                {starredMessages.map(msg => (
                  <div key={msg._id} className="starred-card">
                    <div className="starred-card-top">
                      <img src={msg.sender.avatar} alt={msg.sender.username} className="starred-avatar" />
                      <div className="starred-meta">
                        <span className="starred-sender">{msg.sender.displayName || msg.sender.username}</span>
                        <span className="starred-time">{new Date(msg.createdAt).toLocaleString()}</span>
                      </div>
                      <button className="starred-remove" onClick={() => handleUnstar(msg._id)} title="Remove star">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                    <p className="starred-content">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Profile;