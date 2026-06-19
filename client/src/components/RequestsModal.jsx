import { useState, useEffect } from 'react';
import { messageRequestAPI } from '../utils/api';
import './RequestsModal.css';

const RequestsModal = ({ onClose, onGroupJoined }) => {
  const [activeTab, setActiveTab] = useState('messages'); // 'messages' | 'groups'
  const [messageRequests, setMessageRequests] = useState([]);
  const [groupInvites, setGroupInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [msgRes, groupRes] = await Promise.all([
        messageRequestAPI.getPendingRequests(),
        messageRequestAPI.getGroupInvites(),
      ]);
      setMessageRequests(msgRes.data?.requests || []);
      setGroupInvites(groupRes.data?.invites || []);
    } catch (error) {
      console.error('Load requests error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptMessage = async (id) => {
    try {
      await messageRequestAPI.acceptRequest(id);
      setMessageRequests((prev) => prev.filter((r) => r._id !== id));
    } catch (error) {
      console.error('Accept request error:', error);
    }
  };

  const handleRejectMessage = async (id) => {
    try {
      await messageRequestAPI.rejectRequest(id);
      setMessageRequests((prev) => prev.filter((r) => r._id !== id));
    } catch (error) {
      console.error('Reject request error:', error);
    }
  };

  const handleAcceptGroup = async (id) => {
    try {
      const response = await messageRequestAPI.acceptGroupInvite(id);
      setGroupInvites((prev) => prev.filter((i) => i._id !== id));
      if (response.data?.group) onGroupJoined?.(response.data.group);
    } catch (error) {
      console.error('Accept group invite error:', error);
    }
  };

  const handleRejectGroup = async (id) => {
    try {
      await messageRequestAPI.rejectGroupInvite(id);
      setGroupInvites((prev) => prev.filter((i) => i._id !== id));
    } catch (error) {
      console.error('Reject group invite error:', error);
    }
  };

  return (
    <div className="requests-modal-overlay" onClick={onClose}>
      <div className="requests-modal-v2" onClick={(e) => e.stopPropagation()}>
        <div className="rm-header">
          <h2>Requests</h2>
          <button onClick={onClose} className="close-btn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="rm-tabs">
          <button
            className={`rm-tab ${activeTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            Messages
            {messageRequests.length > 0 && <span className="rm-badge">{messageRequests.length}</span>}
          </button>
          <button
            className={`rm-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            Group Invites
            {groupInvites.length > 0 && <span className="rm-badge">{groupInvites.length}</span>}
          </button>
        </div>

        <div className="rm-content">
          {loading ? (
            <div className="cg-loading"><div className="spinner"></div></div>
          ) : activeTab === 'messages' ? (
            messageRequests.length === 0 ? (
              <div className="rm-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <p>No message requests</p>
              </div>
            ) : (
              messageRequests.map((req) => (
                <div key={req._id} className="rm-item">
                  <img src={req.sender.avatar} alt={req.sender.username} className="rm-avatar" />
                  <div className="rm-info">
                    <h4>{req.sender.displayName || req.sender.username}</h4>
                    <p>{req.message || 'wants to send you a message'}</p>
                  </div>
                  <div className="rm-actions">
                    <button className="rm-accept" onClick={() => handleAcceptMessage(req._id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button className="rm-reject" onClick={() => handleRejectMessage(req._id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )
          ) : (
            groupInvites.length === 0 ? (
              <div className="rm-empty">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <p>No group invites or requests</p>
              </div>
            ) : (
              groupInvites.map((inv) => (
                <div key={inv._id} className="rm-item">
                  {inv.group?.avatar ? (
                    <img src={inv.group.avatar} alt={inv.group.name} className="rm-avatar" />
                  ) : (
                    <div className="rm-avatar group-avatar-fallback">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                  )}
                  <div className="rm-info">
                    <h4>{inv.group?.name}</h4>
                    <p>
                      {inv.invitedBy?.username} {inv.type === 'invite' ? 'invited you to join' : 'wants to add you to'} this group
                    </p>
                  </div>
                  <div className="rm-actions">
                    <button className="rm-accept" onClick={() => handleAcceptGroup(inv._id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                    <button className="rm-reject" onClick={() => handleRejectGroup(inv._id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default RequestsModal;
