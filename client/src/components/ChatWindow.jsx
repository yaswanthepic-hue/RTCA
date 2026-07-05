import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { messageAPI, authAPI } from '../utils/api';
import MessageItem from './MessageItem';
import EmojiPicker from 'emoji-picker-react';
import './ChatWindow.css';

const API_BASE = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const ChatWindow = ({ selectedUser, onBack }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSharedMedia, setShowSharedMedia] = useState(false);
  const [sharedMedia, setSharedMedia] = useState([]);
  const [isPinned, setIsPinned] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [errorMessage, setErrorMessage] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // File preview state (WhatsApp-style confirmation modal)
  const [pendingFile, setPendingFile] = useState(null); // { file, previewUrl, type }
  const [fileCaption, setFileCaption] = useState('');
  const fileCaptionRef = useRef('');
  const [uploading, setUploading] = useState(false);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voicePreview, setVoicePreview] = useState(null); // { blob, url } — shown before sending

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    if (selectedUser) {
      loadMessages();
      checkIfPinned();
    }
  }, [selectedUser]);

  const checkIfPinned = () => {
    setIsPinned(user.pinnedChats?.includes(selectedUser._id) || false);
  };

  useEffect(() => {
    if (!socket) return;

    const handleReceiveMessage = (message) => {
      if (
        message.sender._id === selectedUser?._id ||
        message.recipient._id === selectedUser?._id
      ) {
        setMessages((prev) => {
          if (prev.some(m => m._id === message._id)) {
            return prev;
          }
          if (message.tempId && prev.some(m => m.tempId === message.tempId)) {
            return prev.map(m => m.tempId === message.tempId ? message : m);
          }
          return [...prev, message];
        });
        scrollToBottom();

        if (message.recipient._id === user.id && selectedUser?._id === message.sender._id) {
          socket.emit('markAsRead', { messageId: message._id });
        }
      }
    };

    const handleMessageSent = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.tempId === data.tempId ? data.message : msg
        )
      );
    };

    const handleMessageDelivered = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === data.messageId
            ? { ...msg, deliveredAt: data.deliveredAt }
            : msg
        )
      );
    };

    const handleMessageStatusUpdate = (data) => {
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

    const handleMessageUpdate = (updatedMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg._id === updatedMessage._id ? updatedMessage : msg))
      );
    };

    const handleMessageDeleted = (data) => {
      setMessages((prev) => prev.filter((msg) => msg._id !== data.messageId));
    };

    socket.on('receiveMessage', handleReceiveMessage);
    socket.on('messageSent', handleMessageSent);
    socket.on('messageDelivered', handleMessageDelivered);
    socket.on('messageStatusUpdate', handleMessageStatusUpdate);
    socket.on('userTyping', handleUserTyping);
    socket.on('messageUpdate', handleMessageUpdate);
    socket.on('messageDeleted', handleMessageDeleted);

    return () => {
      socket.off('receiveMessage', handleReceiveMessage);
      socket.off('messageSent', handleMessageSent);
      socket.off('messageDelivered', handleMessageDelivered);
      socket.off('messageStatusUpdate', handleMessageStatusUpdate);
      socket.off('userTyping', handleUserTyping);
      socket.off('messageUpdate', handleMessageUpdate);
      socket.off('messageDeleted', handleMessageDeleted);
    };
  }, [socket, selectedUser, user.id]);

  const loadMessages = async () => {
    setLoading(true);
    setMessages([]);
    try {
      const response = await messageAPI.getConversation(selectedUser._id);
      const msgs = response.data;
      setMessages(msgs);

      if (socket) {
        msgs.forEach(msg => {
          if (msg.recipient._id === user.id && !msg.isRead) {
            socket.emit('markAsRead', { messageId: msg._id });
          }
        });
      }

      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Load messages error:', error);
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

  const handleTyping = () => {
    if (!socket || !selectedUser) return;
    socket.emit('typing', { recipientId: selectedUser._id, isTyping: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { recipientId: selectedUser._id, isTyping: false });
    }, 1000);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedUser) return;

    const messageText = messageInput.trim();
    setMessageInput('');

    const tempId = Date.now().toString();

    socket.emit('sendMessage', {
      recipientId: selectedUser._id,
      content: messageText,
      messageType: 'text',
      tempId,
    });

    const tempMessage = {
      _id: tempId,
      tempId,
      sender: { _id: user.id, username: user.username, avatar: user.avatar },
      recipient: selectedUser,
      content: messageText,
      messageType: 'text',
      createdAt: new Date().toISOString(),
      deliveredAt: null,
      isRead: false,
    };

    setMessages((prev) => [...prev, tempMessage]);
    scrollToBottom();
  };

  // ─── FILE HANDLING ──────────────────────────────────────────────────────────

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file || !selectedUser) return;

    const type = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : file.type.startsWith('audio/')
          ? 'audio'
          : 'file';

    const previewUrl = type === 'image' || type === 'video' || type === 'audio'
      ? URL.createObjectURL(file)
      : null;

    setPendingFile({ file, previewUrl, type, name: file.name, size: file.size });
    setFileCaption('');
    fileCaptionRef.current = '';
    fileInputRef.current.value = '';
  };

  const handleCancelFile = () => {
    if (pendingFile?.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
    setFileCaption('');
    fileCaptionRef.current = '';
  };

  const handleSendFile = async () => {
    if (!pendingFile || !selectedUser) return;
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', pendingFile.file);
      const uploadResponse = await messageAPI.uploadFile(formData);
      const { fileUrl, fileName, fileSize } = uploadResponse.data;

      const tempId = Date.now().toString();
      const messageType = pendingFile.type;

      socket.emit('sendMessage', {
        recipientId: selectedUser._id,
        content: fileCaptionRef.current.trim() || (messageType === 'voice' ? 'Voice message' : ''),
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
        recipient: selectedUser,
        content: fileCaptionRef.current.trim(),
        messageType,
        fileUrl,
        fileName,
        fileSize,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        isRead: false,
      };

      setMessages((prev) => [...prev, tempMessage]);
      scrollToBottom();

      if (pendingFile.previewUrl) URL.revokeObjectURL(pendingFile.previewUrl);
      setPendingFile(null);
      setFileCaption('');
      fileCaptionRef.current = '';
    } catch (error) {
      console.error('File upload error:', error);
      showError('Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  // ─── VOICE RECORDING ────────────────────────────────────────────────────────

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : 'audio/ogg';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const actualMimeType = mediaRecorder.mimeType || mimeType;
        const audioBlob = new Blob(audioChunksRef.current, { type: actualMimeType });
        const audioUrl = URL.createObjectURL(audioBlob);
        setVoicePreview({ blob: audioBlob, url: audioUrl, mimeType: actualMimeType });
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(s => s + 1);
      }, 1000);
    } catch (error) {
      console.error('Recording error:', error);
      showError('Could not access microphone');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
    }
  };

  const handleCancelVoice = () => {
    if (voicePreview?.url) URL.revokeObjectURL(voicePreview.url);
    setVoicePreview(null);
    setRecordingSeconds(0);
  };

  const handleSendVoice = async () => {
    if (!voicePreview || !selectedUser) return;
    setUploading(true);

    try {
      const ext = voicePreview.mimeType?.includes('ogg') ? 'ogg' : 'webm';
      const audioFile = new File([voicePreview.blob], `voice-${Date.now()}.${ext}`, { type: voicePreview.mimeType || 'audio/webm' });
      const formData = new FormData();
      formData.append('file', audioFile);

      const uploadResponse = await messageAPI.uploadFile(formData);
      const { fileUrl, fileName, fileSize } = uploadResponse.data;

      const tempId = Date.now().toString();

      socket.emit('sendMessage', {
        recipientId: selectedUser._id,
        content: 'Voice message',
        messageType: 'voice',
        fileUrl,
        fileName,
        fileSize,
        tempId,
      });

      const tempMessage = {
        _id: tempId,
        tempId,
        sender: { _id: user.id, username: user.username, avatar: user.avatar },
        recipient: selectedUser,
        content: 'Voice message',
        messageType: 'voice',
        fileUrl,
        fileName,
        fileSize,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        isRead: false,
      };

      setMessages((prev) => [...prev, tempMessage]);
      scrollToBottom();

      URL.revokeObjectURL(voicePreview.url);
      setVoicePreview(null);
      setRecordingSeconds(0);
    } catch (error) {
      console.error('Voice upload error:', error);
      showError('Failed to send voice message');
    } finally {
      setUploading(false);
    }
  };

  const formatRecordingTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ─── OTHER HANDLERS ──────────────────────────────────────────────────────────

  const handleEmojiClick = (emojiData) => {
    setMessageInput((prev) => prev + emojiData.emoji);
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
      showError('Failed to load shared media');
    }
  };

  const handleRightClick = (e) => {
    e.preventDefault();
    const menuWidth = 170;
    const menuHeight = 50;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 8);
    setContextMenuPos({ x: Math.max(8, x), y: Math.max(8, y) });
    setShowContextMenu(true);
  };

  const handleCloseChat = () => {
    setShowContextMenu(false);
    if (onBack) onBack();
  };

  const confirmDeleteChat = async () => {
    try {
      await Promise.all(messages.map(msg => messageAPI.deleteMessage?.(msg._id)));
      setShowDeleteConfirm(false);
      setMessages([]);
      if (onBack) onBack();
    } catch (error) {
      console.error('Delete chat error:', error);
      showError('Failed to delete chat');
    }
  };

  // ─── DATE STAMP HELPER ──────────────────────────────────────────────────────

  const getDateLabel = (dateStr) => {
    const msgDate = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (a, b) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();

    if (isSameDay(msgDate, today)) return 'Today';
    if (isSameDay(msgDate, yesterday)) return 'Yesterday';

    // Within the last 7 days → show day name e.g. "Monday"
    const diffDays = Math.floor((today - msgDate) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return msgDate.toLocaleDateString([], { weekday: 'long' });
    }

    // Older → show full date e.g. "12 May 2024"
    return msgDate.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
  };

  if (!selectedUser) {
    return (
      <div className="chat-window-empty">
        <div className="empty-content">
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
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
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
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
          (() => {
            let lastDateLabel = null;
            return messages.map((message) => {
              const dateLabel = getDateLabel(message.createdAt);
              const showStamp = dateLabel !== lastDateLabel;
              lastDateLabel = dateLabel;
              return (
                <div key={message._id}>
                  {showStamp && (
                    <div className="date-stamp">
                      <span>{dateLabel}</span>
                    </div>
                  )}
                  <MessageItem
                    message={message}
                    isSent={message.sender._id === user.id}
                    onError={showError}
                    onDelete={(messageId) => {
                      setMessages(prev => prev.filter(m => m._id !== messageId));
                    }}
                  />
                </div>
              );
            });
          })()
        )}
        {isTyping && (
          <div className="typing-indicator">
            <div className="typing-bubble">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Bar ── */}
      <form onSubmit={handleSendMessage} className="message-input-container">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {showEmojiPicker && (
          <>
            <div className="emoji-picker-overlay" onClick={() => setShowEmojiPicker(false)} />
            <div className="emoji-picker-wrapper" onClick={(e) => e.stopPropagation()}>
              <EmojiPicker onEmojiClick={handleEmojiClick} theme="dark" />
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="input-action-btn"
          disabled={uploading || isRecording || !!voicePreview}
          title="Attach file"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className="input-action-btn"
          disabled={uploading || isRecording || !!voicePreview}
          title="Add emoji"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </button>

        <input
          type="text"
          value={messageInput}
          onChange={(e) => { setMessageInput(e.target.value); handleTyping(); }}
          placeholder="Type your message..."
          className="message-input"
          disabled={uploading || isRecording || !!voicePreview}
        />

        {isRecording ? (
          <button
            type="button"
            onClick={handleStopRecording}
            className="input-action-btn recording"
            title="Stop recording"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : !voicePreview && (
          <button
            type="button"
            onClick={handleStartRecording}
            className="input-action-btn"
            disabled={uploading}
            title="Record voice message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        )}

        <button
          type="submit"
          className="send-btn"
          disabled={!messageInput.trim() || uploading || isRecording || !!voicePreview}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>

      {/* ── Recording Timer Banner ── */}
      {isRecording && (
        <div className="recording-banner">
          <span className="recording-dot" />
          Recording… {formatRecordingTime(recordingSeconds)}
          <button type="button" onClick={handleStopRecording} className="recording-stop-btn">
            Stop
          </button>
        </div>
      )}

      {/* ── Voice Preview Modal ── */}
      {voicePreview && (
        <div className="modal-overlay">
          <div className="preview-modal">
            <div className="modal-header">
              <h3>Voice Message Preview</h3>
            </div>
            <div className="voice-preview-body">
              <div className="voice-preview-icon">🎤</div>
              <audio key={voicePreview.url} src={voicePreview.url} controls preload="auto" className="voice-preview-audio" />
              <p className="voice-preview-duration">{formatRecordingTime(recordingSeconds)}</p>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={handleCancelVoice} disabled={uploading}>
                Discard
              </button>
              <button className="send-file-btn" onClick={handleSendVoice} disabled={uploading}>
                {uploading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── File Preview Modal (WhatsApp-style) ── */}
      {pendingFile && (
        <div className="modal-overlay">
          <div className="preview-modal">
            <div className="modal-header">
              <h3>Send {pendingFile.type === 'image' ? 'Image' : pendingFile.type === 'video' ? 'Video' : pendingFile.type === 'audio' ? 'Audio' : 'File'}</h3>
              <button className="close-modal-btn" onClick={handleCancelFile}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="file-preview-body">
              {pendingFile.type === 'image' && (
                <img src={pendingFile.previewUrl} alt="preview" className="file-preview-image" />
              )}
              {pendingFile.type === 'video' && (
                <video src={pendingFile.previewUrl} controls className="file-preview-video" />
              )}
              {pendingFile.type === 'audio' && (
                <audio src={pendingFile.previewUrl} controls className="file-preview-audio" />
              )}
              {pendingFile.type === 'file' && (
                <div className="file-preview-generic">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  <p className="file-preview-name">{pendingFile.name}</p>
                  <p className="file-preview-size">
                    {pendingFile.size < 1024 * 1024
                      ? (pendingFile.size / 1024).toFixed(1) + ' KB'
                      : (pendingFile.size / (1024 * 1024)).toFixed(1) + ' MB'}
                  </p>
                </div>
              )}
            </div>

            <div className="file-caption-row">
              <input
                type="text"
                placeholder="Add a caption…"
                value={fileCaption}
                onChange={(e) => { setFileCaption(e.target.value); fileCaptionRef.current = e.target.value; }}
                className="file-caption-input"
              />
            </div>

            <div className="modal-actions">
              <button className="cancel-btn" onClick={handleCancelFile} disabled={uploading}>
                Cancel
              </button>
              <button className="send-file-btn" onClick={handleSendFile} disabled={uploading}>
                {uploading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Shared Media Modal ── */}
      {showSharedMedia && (
        <div className="shared-media-modal" onClick={() => setShowSharedMedia(false)}>
          <div className="shared-media-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Shared Media with {selectedUser.username}</h2>
              <button onClick={() => setShowSharedMedia(false)} className="close-modal-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
                      <img src={`${API_BASE}${media.fileUrl}`} alt={media.fileName} />
                    )}
                    {media.messageType === 'video' && (
                      <video src={`${API_BASE}${media.fileUrl}`} controls />
                    )}
                    {media.messageType === 'audio' && (
                      <audio src={`${API_BASE}${media.fileUrl}`} controls />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Context Menu ── */}
      {showContextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
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

      {/* ── Error Toast ── */}
      {errorMessage && (
        <div className="error-toast">{errorMessage}</div>
      )}

      {/* ── Delete Chat Confirm ── */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Chat?</h3>
            <p>Are you sure you want to delete all messages with {selectedUser.username}? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
              <button className="delete-btn" onClick={confirmDeleteChat}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatWindow;