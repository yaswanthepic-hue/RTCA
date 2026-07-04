import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import GroupChatWindow from '../components/GroupChatWindow';
import UserList from '../components/UserList';
import RequestsModal from '../components/RequestsModal';
import { messageRequestAPI } from '../utils/api';
import './Chat.css';

const Chat = () => {
  const { user } = useAuth();
  const { socket, connected } = useSocket();
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showUserList, setShowUserList] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [groupsRefreshToken, setGroupsRefreshToken] = useState(0);

  useEffect(() => {
    loadPendingCount();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadPendingCount();
    socket.on('groupInviteReceived', refresh);
    return () => socket.off('groupInviteReceived', refresh);
  }, [socket]);

  const loadPendingCount = async () => {
    try {
      const [msgReqs, groupInvites] = await Promise.all([
        messageRequestAPI.getPendingRequests(),
        messageRequestAPI.getGroupInvites(),
      ]);
      setPendingCount((msgReqs.data?.requests?.length || 0) + (groupInvites.data?.invites?.length || 0));
    } catch (error) {
      console.error('Load pending count error:', error);
    }
  };

  const handleSelectUser = (u) => {
    setSelectedUser(u);
    setSelectedGroup(null);
  };

  const handleSelectGroup = (g) => {
    setSelectedGroup(g);
    setSelectedUser(null);
  };

  return (
    <div className={`chat-container ${selectedUser || selectedGroup ? 'chat-selected' : ''}`}>
      <Sidebar
        selectedUser={selectedUser}
        selectedGroup={selectedGroup}
        onSelectUser={handleSelectUser}
        onSelectGroup={handleSelectGroup}
        onShowUserList={() => setShowUserList(true)}
        onConversationsUpdate={setConversations}
        onShowRequests={() => setShowRequests(true)}
        pendingRequestsCount={pendingCount}
        groupsRefreshToken={groupsRefreshToken}
      />

      {selectedGroup ? (
        <GroupChatWindow
          group={selectedGroup}
          onBack={() => setSelectedGroup(null)}
          onGroupUpdated={(g) => setSelectedGroup(g)}
          onGroupLeft={() => setGroupsRefreshToken((t) => t + 1)}
        />
      ) : (
        <ChatWindow
          selectedUser={selectedUser}
          onBack={() => setSelectedUser(null)}
        />
      )}

      {showUserList && (
        <UserList
          onSelectUser={(user) => {
            setSelectedUser(user);
            setSelectedGroup(null);
            setShowUserList(false);
          }}
          onClose={() => setShowUserList(false)}
          existingConversations={conversations}
        />
      )}

      {showRequests && (
        <RequestsModal
          onClose={() => { setShowRequests(false); loadPendingCount(); }}
          onGroupJoined={(group) => {
            setSelectedGroup(group);
            setShowRequests(false);
          }}
        />
      )}
    </div>
  );
};

export default Chat;