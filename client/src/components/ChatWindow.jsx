import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { messageAPI, authAPI } from '../utils/api';
import MessageItem from './MessageItem';
import EmojiPicker from 'emoji-picker-react';
import './ChatWindow.css';

const ChatWindow = ({ selectedUser, onBack }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [sharedMedia, setSharedMedia] = useState([]);
  const [isPinned, setIsPinned] = useState(false);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState(-1);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      checkIfPinned();
    } else {
      // When chat is closed, reset firstUnreadIndex
      setFirstUnreadIndex(-1);
    }
  }, [selectedUser]);

  const checkIfPinned = () => {
    setIsPinned(user.pinnedChats?.includes(selectedUser._id) || false);
  };

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      console.log('Received message:', message);
      if (
        message.sender._id === selectedUser?._id ||
        message.recipient._id === selectedUser?._id
      ) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();

        // Mark message as read if I'm the recipient and chat is open
        if (message.recipient._id === user.id && selectedUser?._id === message.sender._id) {
          socket.emit('markAsRead', { messageId: message._id });
        }
      }
    };

    const handleMessageStatusUpdate = (data) => {
      console.log('Message status update:', data);
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, isRead: data.isRead, readAt: data.readAt }
            : msg
        )
      );
    };

    const handleUserTyping = (data) => {
      if (data.userId === selectedUser?._id) {
        setIsTyping(data.isTyping);
      }
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('messageStatusUpdate', handleMessageStatusUpdate);
    socket.on('userTyping', handleUserTyping);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('messageStatusUpdate', handleMessageStatusUpdate);
      socket.off('userTyping', handleUserTyping);
    };
  }, [socket, selectedUser, user.id]);

  const loadMessages = async () => {
    setLoading(true);
    setMessages([]); // Clear old messages immediately for faster perceived load
    try {
      const response = await messageAPI.getConversation(selectedUser._id);
      const msgs = response.data;
      setMessages(msgs);

      // Scroll to bottom immediately (removed unread logic per user request)
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Load messages error:', error);
      setErrorMessage('Failed to load messages');
      setTimeout(() => setErrorMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const scrollToFirstUnread = () => {
    setTimeout(() => {
      const unreadDivider = document.querySelector('.unread-divider');
      if (unreadDivider) {
        unreadDivider.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        scrollToBottom();
      }
    }, 100);
  };

  const handleTyping = () => {
    if (!socket || !selectedUser) return;

    socket.emit('typing', {
      recipientId: selectedUser._id,
      isTyping: true,
    });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', {
        recipientId: selectedUser._id,
        isTyping: false,
      });
    }, 1000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();

    if (!messageInput.trim() || !selectedUser) return;

    const messageText = messageInput.trim();
    setMessageInput('');

    try {
      // NO ENCRYPTION - Send plain text
      const tempId = Date.now().toString();

      // Emit via socket
      socket.emit('sendMessage', {
        recipientId: selectedUser._id,
        content: messageText,  // Plain text message
        messageType: 'text',
        tempId,
      });

      // Optimistically add to UI
      const tempMessage = {
        _id: tempId,
        sender: { _id: user.id, username: user.username, avatar: user.avatar },
        recipient: selectedUser,
        content: messageText,  // Plain text
        messageType: 'text',
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, tempMessage]);
      scrollToBottom();
    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedUser) return;

    setUploading(true);

    try {
      // Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await messageAPI.uploadFile(formData);
      const { fileUrl, fileName, fileSize } = uploadResponse.data;

      const messageType = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';

      // Send message with file
      socket.emit('sendMessage', {
        recipientId: selectedUser._id,
        content: `File: ${fileName}`,
        messageType,
        fileUrl,
        fileName,
        fileSize,
        tempId: Date.now().toString(),
      });
    } catch (error) {
      console.error('File upload error:', error);
    } finally {
      setUploading(false);
      fileInputRef.current.value = '';
    }
  };

  const handleEmojiClick = (emojiData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

        // Upload voice message
        const formData = new FormData();
        formData.append('file', audioFile);

        try {
          const uploadResponse = await messageAPI.uploadFile(formData);
          const { fileUrl, fileName, fileSize } = uploadResponse.data;

          socket.emit('sendMessage', {
            recipientId: selectedUser._id,
            content: 'Voice message',
            messageType: 'voice',
            fileUrl,
            fileName,
            fileSize,
            tempId: Date.now().toString(),
          });
        } catch (error) {
          console.error('Voice upload error:', error);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      setErrorMessage('Could not access microphone');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handlePinChat = async () => {
    try {
      if (isPinned) {
        await authAPI.unpinChat(selectedUser._id);
        setIsPinned(false);
      } else {
        await authAPI.pinChat(selectedUser._id);
        setIsPinned(true);
      }
    } catch (error) {
      console.error('Pin chat error:', error);
    }
  };

  const handleViewSharedMedia = async () => {
    try {
      const response = await messageAPI.getSharedMedia(selectedUser._id);
      setSharedMedia(response.data.messages || response.data || []);
      setShowSharedMedia(true);
    } catch (error) {
      console.error('Load shared media error:', error);
      setErrorMessage('Failed to load shared media');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleCloseChat = () => {
    setShowContextMenu(false);
    if (onBack) {
      onBack();
    }
  };

  const handleDeleteChat = () => {
    setShowContextMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteChat = async () => {
    try {
      // Delete all messages with this user
      await Promise.all(
        messages.map(msg => messageAPI.deleteMessage?.(msg._id))
      );
      setShowDeleteConfirm(false);
      setMessages([]);
      if (onBack) onBack();
    } catch (error) {
      console.error('Delete chat error:', error);
      setErrorMessage('Failed to delete chat');
      setTimeout(() => setErrorMessage(''), 3000);
    }
  };

  if (!selectedUser) {
    return (
      <div className="chat-window-empty">
        <div className="empty-content">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <line x1="9" y1="10" x2="15" y2="10" />
            <line x1="9" y1="14" x2="13" y2="14" />
          </svg>
          <h2>Select a conversation</h2>
          <p>Choose a user from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-header">
        <button className="back-to-chats-btn" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div className="chat-user-info">
          <img src={selectedUser.avatar} alt={selectedUser.username} className="chat-avatar" />
          <div>
            <h3>{selectedUser.username}</h3>
            <span className="user-status-text">
              {selectedUser.status === 'online' ? '🟢 Online' : '⚫ Offline'}
            </span>
          </div>
        </div>
        <div className="chat-actions">
          <button onClick={handleViewSharedMedia} className="action-btn" title="Shared Media">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <button onClick={handlePinChat} className={`action-btn ${isPinned ? 'active' : ''}`} title={isPinned ? 'Unpin Chat' : 'Pin Chat'}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 17v5"/>
              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
            </svg>
          </button>
        </div>
      </div>

      <div
        className="messages-container"
        onContextMenu={handleRightClick}
        onClick={() => setShowContextMenu(false)}
      >
        {loading ? (
          <div className="loading-messages">
            <div className="spinner"></div>
            <p>Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="no-messages">
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={message._id}>
              <MessageItem
                message={message}
                isSent={message.sender._id === user.id}
                onError={(msg) => {
                  setErrorMessage(msg);
                  setTimeout(() => setErrorMessage(''), 3000);
                }}
                onDelete={(messageId) => {
                  setMessages(prev => prev.filter(m => m._id !== messageId));
                }}
              />
            </div>
          ))
        )}
        {isTyping && (
          <div className="typing-indicator">
            <div className="typing-bubble">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="message-input-container">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />

        {showEmojiPicker && (
          <div className="emoji-picker-wrapper">
            <EmojiPicker onEmojiClick={handleEmojiClick} theme="dark" />
          </div>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="input-action-btn"
          disabled={uploading || isRecording}
          title="Attach file"
        >
          {uploading ? (
            <div className="mini-spinner"></div>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="input-action-btn"
          disabled={uploading || isRecording}
          title="Add emoji"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
            <line x1="9" y1="9" x2="9.01" y2="9"/>
            <line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </button>

        <input
          type="text"
          value={messageInput}
          onChange={(e) => {
            setMessageInput(e.target.value);
            handleTyping();
          }}
          placeholder="Type your message..."
          className="message-input"
          disabled={uploading || isRecording}
        />

        {isRecording ? (
          <button
            type="button"
            onClick={handleStopRecording}
            className="input-action-btn recording"
            title="Stop recording"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleStartRecording}
            className="input-action-btn"
            disabled={uploading}
            title="Record voice message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        )}

        <button
          type="submit"
          className="send-btn"
          disabled={!messageInput.trim() || uploading || isRecording}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>

      {showSharedMedia && (
        <div className="shared-media-modal" onClick={() => setShowSharedMedia(false)}>
          <div className="shared-media-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Shared Media with {selectedUser.username}</h2>
              <button onClick={() => setShowSharedMedia(false)} className="close-modal-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="media-grid">
              {sharedMedia.length === 0 ? (
                <p className="no-media">No shared media yet</p>
              ) : (
                sharedMedia.map((media) => (
                  <div key={media._id} className="media-item">
                    {media.messageType === 'image' && (
                      <img src={`${import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'}${media.fileUrl}`} alt={media.fileName} />
                    )}
                    {media.messageType === 'video' && (
                      <video src={`${import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'}${media.fileUrl}`} controls />
                    )}
                    {media.messageType === 'audio' && (
                      <audio src={`${import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'}${media.fileUrl}`} controls />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu for Right Click */}
      {showContextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleCloseChat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Close Chat
          </button>
          <button className="context-menu-item danger" onClick={handleDeleteChat}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
            Delete Chat
          </button>
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div className="error-toast">
          {errorMessage}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Chat?</h3>
            <p>Are you sure you want to delete all messages with {selectedUser.username}? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="delete-btn" onClick={confirmDeleteChat}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;
