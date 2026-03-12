import React, { useState, useEffect, useRef } from 'react';
import Auth from './components/Auth';
import io from 'socket.io-client';
import axios from 'axios';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export default function App() {
  const [user, setUser] = useState(null);
  const [msg, setMsg] = useState("");
  const [chat, setChat] = useState([]);
  const [socket, setSocket] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [unreadCounts, setUnreadCounts] = useState({}); // Track unread messages per user

  const messagesEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  // Load user from localStorage on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (err) {
        localStorage.removeItem('user');
      }
    }
  }, []);

  useEffect(() => {
    if (user?.token) {
      setLoading(true);
      axios.get(`${API_URL}/api/users`)
        .then(res => setUsersList(res.data.filter(u => u.username !== user.username)))
        .catch(e => {
          console.error('Failed to fetch users:', e);
          setError('Failed to load users list');
        })
        .finally(() => setLoading(false));

      const s = io(API_URL, { 
        auth: { token: user.token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });

      s.on('connect', () => {
        console.log('Connected to server');
        setError('');
      });

      s.on('message', (m) => {
        setChat(prev => {
          // Deduplicate: Check if message already exists (prevents duplicates for optimistic updates)
          const messageExists = prev.some(existingMsg => 
            existingMsg.senderId === m.senderId && 
            existingMsg.text === m.text &&
            // Check if timestamps are within 1 second (to account for optimistic vs server timestamp)
            Math.abs(new Date(existingMsg.timestamp) - new Date(m.timestamp)) < 1000
          );
          
          if (messageExists) {
            // Message already in chat, just update it with server data (status, etc)
            return prev.map(msg => 
              msg.senderId === m.senderId && 
              msg.text === m.text &&
              Math.abs(new Date(msg.timestamp) - new Date(m.timestamp)) < 1000
                ? m 
                : msg
            );
          }
          
         
          return [...prev, m];
        });
        
     
        if (m.senderId !== user.username && m.senderId !== selectedUser?.username) {
          setUnreadCounts(prev => ({
            ...prev,
            [m.senderId]: (prev[m.senderId] || 0) + 1
          }));
        }
      });

      s.on('error', (err) => {
        console.error('Socket error:', err);
        setError(err.message || 'Connection error');
      });

      s.on('disconnect', () => {
        console.log('Disconnected from server');
      });

      setSocket(s);
      return () => {
        s.off('message');
        s.off('error');
        s.off('connect');
        s.off('disconnect');
        s.disconnect();
      };
    }
  }, [user]);

  useEffect(() => {
    if (socket) {
      const handleUserStatus = (data) => {
        if (data.status === 'online') {
          setOnlineUsers(prev => [...new Set([...prev, data.username])]);
        } else {
          setOnlineUsers(prev => prev.filter(u => u !== data.username));
        }
      };
      
      socket.on('user_status', handleUserStatus);
      
      return () => {
        socket.off('user_status', handleUserStatus);
      };
    }
  }, [socket]);


  useEffect(() => {
    if (socket && currentRoom) {
      socket.emit('mark_read', { conversationId: currentRoom });
      
      const handleMessagesRead = () => {
        setChat(prevChat => prevChat.map(m => ({ ...m, status: 'read' })));
      };
      
      socket.on('messages_read', handleMessagesRead);
      
      return () => {
        socket.off('messages_read', handleMessagesRead);
      };
    }
  }, [currentRoom, socket]);

  const selectChat = async (u) => {
    if (currentRoom) socket.emit('leave', currentRoom);

    const newRoom = [user.username, u.username].sort().join('_');

    setSelectedUser(u);
    setCurrentRoom(newRoom);
    
    // Clear unread count for this user
    setUnreadCounts(prev => ({
      ...prev,
      [u.username]: 0
    }));
    
    setLoading(true);
    setError('');

    // Join room first to receive real-time messages
    socket.emit('join', newRoom);

    try {
      const res = await axios.get(`${API_URL}/api/messages/${newRoom}`);
      setChat(res.data);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setError('Failed to load message history');
      setChat([]);
    } finally {
      setLoading(false);
    }
  };

  const send = () => {
    if (!currentRoom) {
      setError('Please select a user first to send a message');
      return;
    }
    if (!msg.trim()) return;

    const newMsg = {
        senderId: user.username,
        text: msg.trim(),
        status: "sent",
        timestamp: new Date()
    };

    setChat(prev => [...prev, newMsg]); // show immediately

    socket.emit('send_message', {
        conversationId: currentRoom,
        text: msg.trim()
    });

    setMsg("");
};

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setChat([]);
    setUsersList([]);
    setOnlineUsers([]);
    setCurrentRoom(null);
    setSelectedUser(null);
    setUnreadCounts({});
    if (socket) socket.disconnect();
  };

  if (!user) return <Auth onLogin={(token, username) => {
    const userData = { token, username };
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  }} />;

  return (
    <div className="app-container">

     
      <div className="left-panel">

        <div className="profile-card">
          <div className="avatar"></div>
          <div className="profile">
            <h3>{user.username}</h3>
            <p className="status">Active now</p>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="people-list">

          <div className="people-header">
            <h3>Top People</h3>
            {loading && <span className="loading-spinner">⟳</span>}
          </div>

          {usersList.length === 0 ? (
            <p className="no-users">No users available</p>
          ) : (
            usersList.map((u) => {
              const unreadCount = unreadCounts[u.username] || 0;
              return (
                <div
                  key={u._id}
                  className={`person-card ${selectedUser?.username === u.username ? "active" : ""}`}
                  onClick={() => selectChat(u)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectChat(u);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedUser?.username === u.username}
                  aria-label={`Chat with ${u.username} - ${onlineUsers.includes(u.username) ? 'Online' : 'Offline'}${unreadCount > 0 ? ` - ${unreadCount} unread messages` : ''}`}
                >
                  <div className="avatar small"></div>

                  <div className="person-info">
                    <h4>{u.username}</h4>
                    <p aria-live="polite">
                      {onlineUsers.includes(u.username) ? "Online" : "Offline"}
                    </p>
                  </div>

                  <div className="person-actions">
                    {unreadCount > 0 && (
                      <div className="unread-badge" aria-label={`${unreadCount} unread messages`}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}

                    <div
                      className="status-dot"
                      aria-label={onlineUsers.includes(u.username) ? 'Online' : 'Offline'}
                      style={{
                        backgroundColor: onlineUsers.includes(u.username)
                          ? "#2ecc71"
                          : "#aaa"
                      }}
                    ></div>
                  </div>
                </div>
              );
            })
          )}

        </div>

        <div className="favorite-box">
          Favourite List
        </div>

      </div>

    

      <div className="chat-panel">

        <div className="chat-header">
          {selectedUser ? (
            <>
              <div className="avatar small"></div>
              <h3>{selectedUser.username}</h3>
            </>
          ) : (
            <h3>Select a user to start chatting</h3>
          )}
        </div>

        <div className="messages-area">
          {loading && <p className="loading-messages">Loading messages...</p>}
          {chat.map((m, i) => (
            <div
              key={m.timestamp ? m.timestamp.toString() : `msg-${i}`}
              className={`message ${m.senderId === user.username ? "sent" : "received"
                }`}
            >
              <div className="message-content">{m.text}</div>
              <span className="message-status">{m.status}</span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-area">
          <label htmlFor="message-input" className="sr-only">Type your message</label>
          <input
            id="message-input"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && send()}
            placeholder="Type something..."
            disabled={!currentRoom}
            aria-label="Message input"
            aria-disabled={!currentRoom}
          />

          <button 
            onClick={send} 
            disabled={!currentRoom || !msg.trim()}
            aria-label="Send message"
          >
            ➤
          </button>
        </div>

      </div>

    </div>
  );
}
