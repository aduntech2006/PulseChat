// frontend/src/hooks/useSocket.js
import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

export const useSocket = (userId, selectedChat) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    const socketInstance = io(import.meta.env.VITE_SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      setConnectionStatus('connected');
      socketInstance.emit('user-online', userId);
    });

    socketInstance.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });

    socketInstance.on('user-status-change', ({ userId, status }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        if (status === 'online') {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });
    });

    setSocket(socketInstance);

    return () => socketInstance.disconnect();
  }, [userId]);

  const sendMessage = (data) => {
    if (socket) {
      socket.emit('send-message', data);
    }
  };

  const editMessage = (messageId, newMessage) => {
    if (socket) {
      socket.emit('edit-message', { messageId, newMessage });
    }
  };

  const deleteMessage = (messageId) => {
    if (socket) {
      socket.emit('delete-message', { messageId });
    }
  };

  return {
    socket,
    onlineUsers,
    typingUsers,
    connectionStatus,
    sendMessage,
    editMessage,
    deleteMessage
  };
};






