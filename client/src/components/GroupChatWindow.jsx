import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { groupAPI, messageAPI } from '../utils/api';
import GroupInfoModal from './GroupInfoModal';
import './GroupChatWindow.css';

const API_BASE = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const GroupChatWindow = ({ group, onBack, onGroupUpdated, onGroupLeft }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState({}); // userId -> username
  const [showInfo, setShowInfo] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [msgContextMenu, setMsgContextMenu] = useState(null); // { x, y, message }
  const [chatContextMenu, setChatContextMenu] = useState(null); // { x, y }
  const [deleteMsgConfirm, setDeleteMsgConfirm] = useState(null); // message pending delete

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (group) {
      loadMessages();
      if (socket) socket.emit('joinGroupRoom', { groupId: group._id });
    }
  }, [group?._id]);

  useEffect(() => {
    if (!socket || !group) return;

    const handleReceiveGroupMessage = (message) => {
      if (message.group !== group._id && message.group?._id !== group._id) return;
      setMessages((prev) => {
        if (prev.some((m) => String(m._id) === String(message._id))) return prev;
        return [...prev, message];
      });
      scrollToBottom();

      const senderId = message.sender?._id || message.sender;
      if (senderId !== user.id && message.messageType !== 'system') {
        socket.emit('markGroupMessageRead', { messageId: message._id });
      }
    };

    const handleGroupMessageSent = (data) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.tempId !== data.tempId) return m;
          // Preserve any status update that may have already arrived for this
          // message before the ack (e.g. a fast reader marking it read).
          return {
            ...data.message,
            deliveredCount: Math.max(m.deliveredCount || 0, data.message.deliveredTo?.length || 0),
            readCount: Math.max(m.readCount || 0, data.message.readBy?.length || 0),
          };
        })
      );
    };

    const handleGroupMessageStatusUpdate = (data) => {
      setMessages((prev) =>
        prev.map((m) =>
          String(m._id) === String(data.messageId)
            ? {
              ...m,
              deliveredCount: Math.max(m.deliveredCount || 0, data.deliveredCount || 0),
              readCount: Math.max(m.readCount || 0, data.readCount || 0),
            }
            : m
        )
      );
    };

    const handleGroupTyping = (data) => {
      if (data.groupId !== group._id) return;
      setTypingUsers((prev) => {
        const next = { ...prev };
        if (data.isTyping) next[data.userId] = data.username;
        else delete next[data.userId];
        return next;
      });
    };

    const handleGroupUpdated = (updatedGroup) => {
      const updatedId = updatedGroup?._id?.toString?.() || updatedGroup?._id;
      if (updatedId !== group._id) return;
      // Ignore partial payloads that don't carry the full member list
      // (e.g. a lightweight ping) so we never wipe out data we already have.
      if (!updatedGroup.members) return;
      onGroupUpdated?.(updatedGroup);
    };

    const handleRemovedFromGroup = (data) => {
      if (data?.groupId !== group._id) return;
      onGroupLeft?.(group._id);
      onBack?.();
    };

    const handleGroupMessageUpdate = (updatedMessage) => {
      const msgGroupId = updatedMessage.group?._id || updatedMessage.group;
      if (String(msgGroupId) !== String(group._id)) return;
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(updatedMessage._id) ? { ...m, ...updatedMessage } : m))
      );
    };

    const handleGroupMessageDeleted = (data) => {
      if (String(data.groupId) !== String(group._id)) return;
      setMessages((prev) => prev.filter((m) => String(m._id) !== String(data.messageId)));
    };

    socket.on('receiveGroupMessage', handleReceiveGroupMessage);
    socket.on('groupMessageSent', handleGroupMessageSent);
    socket.on('groupMessageStatusUpdate', handleGroupMessageStatusUpdate);
    socket.on('groupUserTyping', handleGroupTyping);
    socket.on('groupUpdated', handleGroupUpdated);
    socket.on('removedFromGroup', handleRemovedFromGroup);
    socket.on('groupMessageUpdate', handleGroupMessageUpdate);
    socket.on('groupMessageDeleted', handleGroupMessageDeleted);

    return () => {
      socket.off('receiveGroupMessage', handleReceiveGroupMessage);
      socket.off('groupMessageSent', handleGroupMessageSent);
      socket.off('groupMessageStatusUpdate', handleGroupMessageStatusUpdate);
      socket.off('groupUserTyping', handleGroupTyping);
      socket.off('groupUpdated', handleGroupUpdated);
      socket.off('removedFromGroup', handleRemovedFromGroup);
      socket.off('groupMessageUpdate', handleGroupMessageUpdate);
      socket.off('groupMessageDeleted', handleGroupMessageDeleted);
    };
  }, [socket, group?._id]);

  const loadMessages = async () => {
    setLoading(true);
    setMessages([]);
    try {
      const response = await groupAPI.getGroupMessages(group._id);
      const msgs = response.data.messages;
      setMessages(msgs);

      if (socket) {
        msgs.forEach((msg) => {
          const senderId = msg.sender?._id || msg.sender;
          const alreadyRead = (msg.readBy || []).some((r) => (r.user?._id || r.user) === user.id);
          if (senderId !== user.id && msg.messageType !== 'system' && !alreadyRead) {
            socket.emit('markGroupMessageRead', { messageId: msg._id });
          }
        });
      }

      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Load group messages error:', error);
      showError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const showError = (msg) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(''), 3000);
  };

  const handleMessageContextMenu = (e, message) => {
    e.preventDefault();
    e.stopPropagation(); // don't trigger the chat-area "Close Chat" menu
    setMsgContextMenu({ x: e.clientX, y: e.clientY, message });
  };

  const handleChatAreaContextMenu = (e) => {
    e.preventDefault();
    setChatContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleTogglePinMessage = async (message) => {
    setMsgContextMenu(null);
    try {
      if (message.isPinned) {
        await groupAPI.unpinGroupMessage(group._id, message._id);
      } else {
        await groupAPI.pinGroupMessage(group._id, message._id);
      }
    } catch (error) {
      console.error('Pin group message error:', error);
      showError('Failed to update pin');
    }
  };

  const handleDeleteMessageClick = (message) => {
    setMsgContextMenu(null);
    setDeleteMsgConfirm(message);
  };

  const confirmDeleteGroupMessage = async () => {
    if (!deleteMsgConfirm) return;
    const messageId = deleteMsgConfirm._id;
    try {
      await groupAPI.deleteGroupMessage(group._id, messageId);
      setMessages((prev) => prev.filter((m) => m._id !== messageId));
      setDeleteMsgConfirm(null);
    } catch (error) {
      console.error('Delete group message error:', error);
      showError('Failed to delete message');
      setDeleteMsgConfirm(null);
    }
  };

  const handleCloseChat = () => {
    setChatContextMenu(null);
    if (onBack) onBack();
  };

  const handleTyping = () => {
    if (!socket || !group) return;
    socket.emit('groupTyping', { groupId: group._id, isTyping: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('groupTyping', { groupId: group._id, isTyping: false });
    }, 1000);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !group) return;

    const messageText = messageInput.trim();
    setMessageInput('');
    const tempId = Date.now().toString();

    socket.emit('sendGroupMessage', {
      groupId: group._id,
      content: messageText,
      messageType: 'text',
      tempId,
    });

    const tempMessage = {
      _id: tempId,
      tempId,
      sender: { _id: user.id, username: user.username, avatar: user.avatar },
      group: group._id,
      content: messageText,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom();
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file || !group) return;
    setPendingFile(file);
    fileInputRef.current.value = '';
  };

  const handleSendFile = async () => {
    if (!pendingFile || !group) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingFile);
      const uploadResponse = await messageAPI.uploadFile(formData);
      const { fileUrl, fileName, fileSize } = uploadResponse.data;

      const messageType = pendingFile.type.startsWith('image/')
        ? 'image'
        : pendingFile.type.startsWith('video/')
          ? 'video'
          : pendingFile.type.startsWith('audio/')
            ? 'audio'
            : 'file';

      const tempId = Date.now().toString();

      socket.emit('sendGroupMessage', {
        groupId: group._id,
        content: '',
        messageType,
        fileUrl,
        fileName,
        fileSize,
        tempId,
      });

      const tempMessage = {
        _id: tempId,
        tempId,
        sender: { _id: user.id, username: user.username, avatar: user.avatar },
        group: group._id,
        content: '',
        messageType,
        fileUrl,
        fileName,
        fileSize,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempMessage]);
      scrollToBottom();
      setPendingFile(null);
    } catch (error) {
      console.error('File upload error:', error);
      showError('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const formatTime = (date) =>
    new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const renderStatus = (message) => {
    // Prefer the snapshot taken when the message was sent so a message's
    // "read by everyone" status stays stable even if members join/leave
    // later. Fall back to the live member count for older messages that
    // predate this field.
    const totalOthers = message.recipientCount || Math.max((group.members?.length || 1) - 1, 0);
    if (totalOthers === 0) return null;

    const delivered = message.deliveredCount ?? message.deliveredTo?.length ?? 0;
    const read = message.readCount ?? message.readBy?.length ?? 0;
    const isRead = read >= totalOthers;
    const isDelivered = delivered > 0;

    return (
      <span
        className={`group-msg-status ${isRead ? 'read' : isDelivered ? 'delivered' : 'sent'}`}
        title={`Delivered to ${delivered}/${totalOthers} · Read by ${read}/${totalOthers}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isDelivered ? (
            <>
              <polyline points="9 11 12 14 22 4" />
              <polyline points="4 11 7 14 17 4" />
            </>
          ) : (
            <polyline points="9 11 12 14 22 4" />
          )}
        </svg>
      </span>
    );
  };

  const typingNames = Object.values(typingUsers);

  if (!group) {
    return (
      <div className="chat-window-empty">
        <div className="empty-content">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <h2>Select a group</h2>
          <p>Choose a group from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window group-chat-window">
      <div className="chat-header">
        <button className="back-to-chats-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div className="chat-user-info" onClick={() => setShowInfo(true)} style={{ cursor: 'pointer' }}>
          {group.avatar ? (
            <img src={group.avatar} alt={group.name} className="chat-avatar" />
          ) : (
            <div className="group-avatar-fallback">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          )}
          <div>
            <h3>{group.name}</h3>
            <span className="user-status-text">
              {typingNames.length > 0
                ? `${typingNames.join(', ')} typing…`
                : `${group.members?.length || 0} members`}
            </span>
          </div>
        </div>
        <div className="chat-actions">
          <button onClick={() => setShowInfo(true)} className="action-btn" title="Group info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="8" />
            </svg>
          </button>
        </div>
      </div>

      <div
        className="messages-container"
        onContextMenu={handleChatAreaContextMenu}
        onClick={() => setChatContextMenu(null)}
      >
        {loading ? (
          <div className="loading-messages">
            <div className="spinner"></div>
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Say hello to the group!</p>
          </div>
        ) : (
          messages.map((message) => {
            if (message.messageType === 'system') {
              return (
                <div key={message._id} className="group-system-message">
                  <span>{message.content}</span>
                </div>
              );
            }
            const senderId = message.sender?._id || message.sender;
            const isSent = senderId === user.id;
            return (
              <div
                key={message._id}
                className={`group-message ${isSent ? 'sent' : 'received'} ${message.isPinned ? 'pinned' : ''}`}
                onContextMenu={(e) => handleMessageContextMenu(e, message)}
              >
                {!isSent && (
                  <img
                    src={message.sender?.avatar}
                    alt={message.sender?.username}
                    className="group-msg-avatar"
                  />
                )}
                <div className="group-msg-bubble">
                  {message.isPinned && (
                    <div className="pin-indicator">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                      Pinned
                    </div>
                  )}
                  {!isSent && <span className="group-msg-sender">{message.sender?.username}</span>}
                  {message.messageType === 'text' || !message.messageType ? (
                    <p className="group-msg-text">{message.content}</p>
                  ) : message.messageType === 'image' ? (
                    <img src={`${API_BASE}${message.fileUrl}`} alt={message.fileName} className="group-msg-media" />
                  ) : message.messageType === 'video' ? (
                    <video src={`${API_BASE}${message.fileUrl}`} controls className="group-msg-media" />
                  ) : message.messageType === 'audio' || message.messageType === 'voice' ? (
                    <audio src={`${API_BASE}${message.fileUrl}`} controls />
                  ) : (
                    <a href={`${API_BASE}${message.fileUrl}`} target="_blank" rel="noreferrer" className="group-msg-file">
                      📎 {message.fileName}
                    </a>
                  )}
                  {isSent ? (
                    <div className="group-msg-meta">
                      <span className="group-msg-time">{formatTime(message.createdAt)}</span>
                      {renderStatus(message)}
                    </div>
                  ) : (
                    <span className="group-msg-time">{formatTime(message.createdAt)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="message-input-container">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current.click()}
          className="input-action-btn"
          disabled={uploading}
          title="Attach file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          type="text"
          value={messageInput}
          onChange={(e) => { setMessageInput(e.target.value); handleTyping(); }}
          placeholder={`Message ${group.name}`}
          className="message-input"
          disabled={uploading}
        />
        <button type="submit" className="send-btn" disabled={!messageInput.trim() || uploading}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>

      {pendingFile && (
        <div className="modal-overlay">
          <div className="preview-modal">
            <div className="modal-header">
              <h3>Send File</h3>
              <button className="close-modal-btn" onClick={() => setPendingFile(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="file-preview-body">
              <div className="file-preview-generic">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                <p className="file-preview-name">{pendingFile.name}</p>
              </div>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setPendingFile(null)} disabled={uploading}>Cancel</button>
              <button className="send-file-btn" onClick={handleSendFile} disabled={uploading}>
                {uploading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && <div className="error-toast">{errorMessage}</div>}

      {/* ── Message Context Menu (Pin/Delete) ── */}
      {msgContextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setMsgContextMenu(null)} />
          <div
            className="message-context-menu"
            style={{ top: msgContextMenu.y, left: msgContextMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => handleTogglePinMessage(msgContextMenu.message)} className="context-menu-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {msgContextMenu.message.isPinned ? 'Unpin' : 'Pin'} Message
            </button>
            {(msgContextMenu.message.sender?._id || msgContextMenu.message.sender) === user.id && (
              <button onClick={() => handleDeleteMessageClick(msgContextMenu.message)} className="context-menu-item danger">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                Delete Message
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Chat Area Context Menu (Close Chat) ── */}
      {chatContextMenu && (
        <div
          className="context-menu"
          style={{ top: chatContextMenu.y, left: chatContextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleCloseChat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Close Chat
          </button>
        </div>
      )}

      {/* ── Delete Message Confirm ── */}
      {deleteMsgConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteMsgConfirm(null)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Message?</h3>
            <p>Are you sure you want to delete this message? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setDeleteMsgConfirm(null)}>Cancel</button>
              <button className="delete-btn" onClick={confirmDeleteGroupMessage}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showInfo && (
        <GroupInfoModal
          group={group}
          onClose={() => setShowInfo(false)}
          onGroupUpdated={onGroupUpdated}
          onGroupLeft={(groupId) => {
            setShowInfo(false);
            onGroupLeft?.(groupId);
            onBack?.();
          }}
        />
      )}
    </div>
  );
};

export default GroupChatWindow;