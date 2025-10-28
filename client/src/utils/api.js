import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth APIs
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  getCurrentUser: () => api.get('/auth/me'),
  updateProfile: (data) => api.put('/auth/profile', data),
  uploadAvatar: (avatar) => api.post('/auth/upload-avatar', { avatar }),
  blockUser: (userId) => api.post(`/auth/block/${userId}`),
  unblockUser: (userId) => api.post(`/auth/unblock/${userId}`),
  getBlockedUsers: () => api.get('/auth/blocked'),
  pinChat: (userId) => api.post(`/auth/pin-chat/${userId}`),
  unpinChat: (userId) => api.post(`/auth/unpin-chat/${userId}`),
  starMessage: (messageId) => api.post(`/auth/star-message/${messageId}`),
  unstarMessage: (messageId) => api.post(`/auth/unstar-message/${messageId}`),
  getStarredMessages: () => api.get('/auth/starred-messages'),
};

// User APIs
export const userAPI = {
  getAllUsers: () => api.get('/users'),
  getUserById: (id) => api.get(`/users/${id}`),
  searchUsers: (query) => api.get(`/users/search/${query}`),
};

// Message APIs
export const messageAPI = {
  getConversation: (userId) => api.get(`/messages/conversation/${userId}`),
  getConversations: () => api.get('/messages/conversations'),
  markAsRead: (userId) => api.put(`/messages/conversation/${userId}/read`),
  markMessageAsRead: (messageId) => api.put(`/messages/${messageId}/read`),
  uploadFile: (formData) => {
    return api.post('/messages/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  pinMessage: (messageId) => api.post(`/messages/${messageId}/pin`),
  unpinMessage: (messageId) => api.post(`/messages/${messageId}/unpin`),
  deleteMessage: (messageId) => api.delete(`/messages/${messageId}`),
  getPinnedMessages: (userId) => api.get(`/messages/conversation/${userId}/pinned`),
  getSharedMedia: (userId) => api.get(`/messages/conversation/${userId}/media`),
  getUnreadCount: () => api.get('/messages/unread-count'),
  getUnreadPerConversation: () => api.get('/messages/unread-per-conversation'),
};

// Message Request APIs
export const messageRequestAPI = {
  sendRequest: (recipientId, message) => api.post(`/message-requests/send/${recipientId}`, { message }),
  getPendingRequests: () => api.get('/message-requests/pending'),
  getSentRequests: () => api.get('/message-requests/sent'),
  acceptRequest: (requestId) => api.post(`/message-requests/accept/${requestId}`),
  rejectRequest: (requestId) => api.post(`/message-requests/reject/${requestId}`),
};

export default api;
