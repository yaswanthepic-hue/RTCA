import { useState } from 'react';
import { messageAPI, authAPI } from '../utils/api';
import './MessageItem.css';

const MessageItem = ({ message, isSent, onError, onDelete }) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const API_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
  const getMessageContent = () => {
    return message.content || '[No content]';
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent ChatWindow context menu from showing
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleStarMessage = async () => {
    try {
      await authAPI.starMessage(message._id);
      setShowContextMenu(false);
      if (onError) onError('Message starred!');
    } catch (error) {
      console.error('Star message error:', error);
      if (onError) onError('Failed to star message');
    }
  };

  const handlePinMessage = async () => {
    try {
      if (message.isPinned) {
        await messageAPI.unpinMessage(message._id);
        if (onError) onError('Message unpinned!');
      } else {
        await messageAPI.pinMessage(message._id);
        if (onError) onError('Message pinned!');
      }
      setShowContextMenu(false);
    } catch (error) {
      console.error('Pin message error:', error);
      if (onError) onError('Failed to pin message');
    }
  };

  const handleDeleteMessage = () => {
    setShowContextMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteMessage = async () => {
    try {
      await messageAPI.deleteMessage(message._id);
      setShowDeleteConfirm(false);
      if (onDelete) onDelete(message._id); // Notify parent to remove message from list
      if (onError) onError('Message deleted');
    } catch (error) {
      console.error('Delete message error:', error);
      if (onError) onError('Failed to delete message');
      setShowDeleteConfirm(false);
    }
  };

  const renderContent = () => {
    if (message.messageType === 'text') {
      return <p className="message-text">{getMessageContent()}</p>;
    }

    if (message.messageType === 'image') {
      return (
        <div className="message-media">
          <img
            src={`${API_URL}${message.fileUrl}`}
            alt={message.fileName}
            className="message-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<div class="media-error">Failed to load image</div>';
            }}
          />
          <p className="media-caption">{getMessageContent()}</p>
        </div>
      );
    }

    if (message.messageType === 'video') {
      return (
        <div className="message-media">
          <video
            src={`${API_URL}${message.fileUrl}`}
            controls
            className="message-video"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<div class="media-error">Failed to load video</div>';
            }}
          />
          <p className="media-caption">{getMessageContent()}</p>
        </div>
      );
    }

    if (message.messageType === 'audio' || message.messageType === 'voice') {
      return (
        <div className="message-media">
          <audio
            src={`${API_URL}${message.fileUrl}`}
            controls
            className="message-audio"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<div class="media-error">Failed to load audio</div>';
            }}
          />
          <p className="media-caption">{getMessageContent()}</p>
        </div>
      );
    }

    if (message.messageType === 'sticker') {
      return (
        <div className="message-sticker">
          <img
            src={`${API_URL}${message.fileUrl}`}
            alt="Sticker"
            className="sticker-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<div class="media-error">Failed to load sticker</div>';
            }}
          />
        </div>
      );
    }

    if (message.messageType === 'gif') {
      return (
        <div className="message-gif">
          <img
            src={`${API_URL}${message.fileUrl}`}
            alt="GIF"
            className="gif-image"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.parentNode.innerHTML = '<div class="media-error">Failed to load GIF</div>';
            }}
          />
        </div>
      );
    }

    // Generic file
    return (
      <a
        href={`${API_URL}${message.fileUrl}`}
        download={message.fileName}
        className="message-file"
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="file-icon">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="13 2 13 9 20 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="file-info">
          <p className="file-name">{message.fileName}</p>
          <p className="file-size">{formatFileSize(message.fileSize)}</p>
        </div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="download-icon">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </a>
    );
  };

  return (
    <>
      <div
        className={`message-item ${isSent ? 'sent' : 'received'} ${message.isPinned ? 'pinned' : ''}`}
        onContextMenu={handleContextMenu}
      >
        {!isSent && (
          <img
            src={message.sender.avatar}
            alt={message.sender.username}
            className="message-avatar"
          />
        )}
        <div className="message-bubble">
          {message.isPinned && (
            <div className="pin-indicator">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Pinned
            </div>
          )}
          {renderContent()}
          <div className="message-meta">
            <span className="message-time">{formatTime(message.createdAt)}</span>
            {isSent && (
              <span className={`message-status ${message.isRead ? 'read' : message.createdAt ? 'delivered' : 'sent'}`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {message.isRead ? (
                    <>
                      <polyline points="9 11 12 14 22 4"/>
                      <polyline points="4 11 7 14 17 4"/>
                    </>
                  ) : (
                    <>
                      <polyline points="9 11 12 14 22 4"/>
                      <polyline points="4 11 7 14 17 4" opacity="0.4"/>
                    </>
                  )}
                </svg>
              </span>
            )}
          </div>
        </div>
      </div>

      {showContextMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setShowContextMenu(false)} />
          <div
            className="message-context-menu"
            style={{ top: contextMenuPos.y, left: contextMenuPos.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={handlePinMessage} className="context-menu-item">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              {message.isPinned ? 'Unpin' : 'Pin'} Message
            </button>
            {isSent && (
              <button onClick={handleDeleteMessage} className="context-menu-item danger">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Delete Message
              </button>
            )}
          </div>
        </>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Message?</h3>
            <p>Are you sure you want to delete this message? This cannot be undone.</p>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button className="delete-btn" onClick={confirmDeleteMessage}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MessageItem;
