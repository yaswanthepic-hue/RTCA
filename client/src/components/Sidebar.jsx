import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { messageAPI } from '../utils/api';
import './Sidebar.css';

const Sidebar = ({ selectedUser, onSelectUser, onShowUserList, onConversationsUpdate }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadChats, setUnreadChats] = useState(new Set());

  useEffect(() => {
    loadConversations();
  }, []);

  useEffect(() => {
    if (onConversationsUpdate) {
      onConversationsUpdate(conversations);
    }
  }, [conversations]);

  useEffect(() => {
    if (!socket) return;

    socket.on('receiveMessage', (message) => {
      updateConversations(message);

      // Mark chat as unread if I'm the recipient and chat is not currently open
      if (message.recipient._id === user.id) {
        const senderId = message.sender._id;
        if (!selectedUser || selectedUser._id !== senderId) {
          setUnreadChats(prev => new Set(prev).add(senderId));
        }
      }
    });

    return () => {
      socket.off('receiveMessage');
    };
  }, [socket, selectedUser, user.id]);

  // When user selects a chat, mark it as read
  useEffect(() => {
    if (selectedUser) {
      setUnreadChats(prev => {
        const newSet = new Set(prev);
        newSet.delete(selectedUser._id);
        return newSet;
      });
    }
  }, [selectedUser]);

  const loadConversations = async () => {
    try {
      const response = await messageAPI.getConversations();
      setConversations(response.data);
    } catch (error) {
      console.error('Load conversations error:', error);
    } finally {
      setLoading(false);
    }
  };


  const updateConversations = (message) => {
    setConversations((prev) => {
      const userId = message.sender._id === user.id ? message.recipient._id : message.sender._id;

      const filtered = prev.filter((conv) => conv._id !== userId);

      const newConv = {
        _id: userId,
        user: message.sender._id === user.id ? message.recipient : message.sender,
        lastMessage: message,
      };

      return [newConv, ...filtered];
    });
  };

  const getLastMessagePreview = (conv) => {
    if (!conv.lastMessage) return 'No messages yet';

    const isSent = conv.lastMessage.sender._id === user.id || conv.lastMessage.sender === user.id;

    if (conv.lastMessage.messageType !== 'text') {
      const icons = {
        image: '🖼️',
        video: '🎥',
        audio: '🎵',
        voice: '🎤',
        file: '📎',
        sticker: '😀',
        gif: '🎬'
      };
      const icon = icons[conv.lastMessage.messageType] || '📎';
      return `${isSent ? 'You: ' : ''}${icon} ${conv.lastMessage.fileName || conv.lastMessage.messageType}`;
    }

    const content = conv.lastMessage.content || '[No content]';
    const preview = content.length > 40 ? content.substring(0, 40) + '...' : content;
    return isSent ? `You: ${preview}` : preview;
  };

  const isPinned = (userId) => {
    return user.pinnedChats?.includes(userId);
  };

  let filteredConversations = conversations.filter((conv) =>
    conv.user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: pinned chats at top, then by last message time (most recent first)
  filteredConversations.sort((a, b) => {
    const aPinned = isPinned(a._id);
    const bPinned = isPinned(b._id);

    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;

    // Both pinned or both not pinned, sort by most recent message time
    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime; // Most recent first
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="user-profile" onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }}>
          <img src={user.avatar} alt={user.username} className="user-avatar" />
          <div className="user-info">
            <h3>{user.username}</h3>
            <span className="user-status">Online</span>
          </div>
        </div>
        <div className="header-actions">
          <button onClick={logout} className="logout-btn" title="Logout">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="sidebar-search">
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <button onClick={onShowUserList} className="new-chat-btn" title="New chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="conversations-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p>No conversations yet</p>
            <button onClick={onShowUserList} className="start-chat-btn">
              Start chatting
            </button>
          </div>
        ) : (
          filteredConversations.map((conv) => {
            const pinned = isPinned(conv._id);
            const hasUnread = unreadChats.has(conv._id);

            return (
              <div
                key={conv._id}
                className={`conversation-item ${selectedUser?._id === conv._id ? 'active' : ''} ${pinned ? 'pinned' : ''}`}
                onClick={() => onSelectUser(conv.user)}
              >
                <div className="conv-avatar-container">
                  <img src={conv.user.avatar} alt={conv.user.username} className="conv-avatar" />
                  {hasUnread && <div className="unread-dot"></div>}
                </div>
                <div className="conv-info">
                  <div className="conv-header">
                    <div className="conv-title">
                      {pinned && <span className="pin-icon">📌</span>}
                      <h4>{conv.user.username}</h4>
                    </div>
                    <span className="conv-time">
                      {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="conv-bottom">
                    <p className="conv-preview">{getLastMessagePreview(conv)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default Sidebar;
