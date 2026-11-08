import { useEffect, useState, useRef } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import axios from "axios";
import io from 'socket.io-client';
import {
  MdOutlineModeNight,
  MdOutlineWbSunny,
  MdOutlineDelete,
  MdClose,
  MdMenu,
  MdArrowBackIos,
  MdSend,
  MdMoreVert,
  MdOutlineReply,
  MdOutlineEdit,
  MdFavorite,
  MdAttachFile,
  MdImage,
  MdMic,
  MdDownload,
  MdCheckCircle,
  MdPause,
  MdPlayArrow,
  MdCheck,
  MdAdd,
  MdDescription,
  MdDone,
  MdDoneAll,
  MdAccessTime,
  MdNotifications
} from 'react-icons/md';

const URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const frequencies = { send: 800, receive: 600, typing: 400, notification: 1000, success: 800, error: 400 };
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(frequencies[type] || 600, audioContext.currentTime);
    oscillator.type = type === 'notification' ? 'square' : 'sine';
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (err) {
    console.log('Sound not available');
  }
};

const showNotification = (title, body) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' });
  }
  playSound('notification');
};

const requestNotificationPermission = () => {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
};

const formatMessageDate = (date) => {
  const now = new Date();
  const messageDate = new Date(date);
  const diffInHours = (now - messageDate) / (1000 * 60 * 60);
  const diffInDays = Math.floor(diffInHours / 24);
  
  if (diffInDays === 0) return 'Today';
  if (diffInDays === 1) return 'Yesterday';
  if (diffInDays < 7) return `${diffInDays} days ago`;
  if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
  
  return messageDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: messageDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
};

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const Dashboard = () => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [msgInput, setMsgInput] = useState("");
  const [selectedChat, setSelectedChat] = useState({ type: "general", data: null });
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [activeMenu, setActiveMenu] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [playingVoice, setPlayingVoice] = useState(null);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [filePreview, setFilePreview] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showMediaMenu, setShowMediaMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);

  // ADDED: store per-message reply inputs
  const [replyInputs, setReplyInputs] = useState({});

  const user = JSON.parse(localStorage.getItem("user") || "null");
  const navigate = useNavigate();
  const messagesEndRef = useRef();
  const fileInputRef = useRef();
  const imageInputRef = useRef();
  const typingTimeoutRef = useRef();
  const recordingIntervalRef = useRef();
  const messagesRefs = useRef({});
  const textareaRef = useRef();
  // NEW: controls whether the next messages update should auto-scroll to bottom.
  // Set to true when you want to force-scroll (e.g., user sent a message / opened chat).
  // Leave false for edits, deletes, reactions so the view won't jump.
  const shouldScrollRef = useRef(false);

  // Suppress noisy connect/disconnect notifications immediately after a refresh
  // Enables notifications after a short grace period so initial socket churn is ignored
  const notificationsEnabledRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => { notificationsEnabledRef.current = true; }, 2000);
    return () => clearTimeout(t);
  }, []);

  if (!user) return <Navigate to="/login" replace />;

  useEffect(() => { requestNotificationPermission(); }, []);

  // Utility: safely parse reactions (string -> array) and ensure array
  const normalizeReactions = (reactions) => {
    if (!reactions) return [];
    if (Array.isArray(reactions)) return reactions;
    try {
      if (typeof reactions === 'string') {
        const parsed = JSON.parse(reactions);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (err) {
      return [];
    }
    return [];
  };

  // FIXED: Click outside handler to close menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (activeMenu && !event.target.closest('.message-menu-container')) {
        setActiveMenu(null);
      }
      if (showMediaMenu && !event.target.closest('.mobile-media-menu')) {
        setShowMediaMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenu, showMediaMenu]);

  // FIXED: Enhanced notification with process type
  const addNotification = (message, type = 'info') => {
    const id = Date.now();
    const notification = { id, message, type };
    setNotifications(prev => [...prev, notification]);
    
    if (type !== 'process') {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, 5000);
    }
  };

  const scrollToMessage = (messageId) => {
    const messageElement = messagesRefs.current[messageId];
    if (messageElement) {
      messageElement.scrollIntoView({ 
        behavior: "smooth", 
        block: "center" 
      });
      messageElement.style.backgroundColor = 'rgba(0, 255, 255, 0.2)';
      setTimeout(() => {
        messageElement.style.backgroundColor = '';
      }, 2000);
    }
  };

  useEffect(() => {
    const socketInstance = io(URL, { 
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    socketInstance.on('connect', () => {
      setConnectionStatus('connected');
      socketInstance.emit('user-online', user.id);
      // avoid showing connect toast right after a page refresh
      if (notificationsEnabledRef.current) {
        console.log('Connected to chat', 'success');
      }
    });

    socketInstance.on('disconnect', () => {
      setConnectionStatus('disconnected');
      // avoid showing disconnect toast right after a page refresh
      if (notificationsEnabledRef.current) {
        console.log('Disconnected from chat', 'error');
      }
    });

    socketInstance.on('connect_error', () => setConnectionStatus('error'));

    socketInstance.on('new-message', (message) => {
      const isForCurrentChat = 
        (selectedChat.type === 'general' && !message.recipient_id) ||
        (selectedChat.type === 'private' && selectedChat.data && 
         ((message.sender_id === user.id && message.recipient_id === selectedChat.data.id) ||
          (message.sender_id === selectedChat.data.id && message.recipient_id === user.id)));

      if (isForCurrentChat) {
        setMessages(prev => {
          const exists = prev.some(m => String(m.id) === String(message.id));
          if (exists) return prev;
          return [...prev, { 
            ...message, 
            status: 'delivered',
            reactions: normalizeReactions(message.reactions)
          }];
        });
      }
      
      if (message.sender_id !== user.id) {
        playSound('receive');
        if (!isForCurrentChat) {
          showNotification(
            `New message from ${message.sender_name}`,
            message.message_type === 'text' ? 
              (message.message.length > 50 ? message.message.slice(0, 50) + '...' : message.message) :
              `${message.message_type} message`
          );
          const chatKey = message.recipient_id ? `private-${message.sender_id}` : 'general';
          setUnreadCounts(prev => ({
            ...prev,
            [chatKey]: (prev[chatKey] || 0) + 1
          }));
        }
      }
    });

    socketInstance.on('message-delivered', ({ tempId, messageId, status }) => {
      setMessages(prev => prev.map(msg => 
        String(msg.id) === String(tempId) ? { ...msg, id: messageId, status: 'delivered' } : msg
      ));
      setActionLoading(null);
    });

    socketInstance.on('message-deleted', ({ messageId }) => {
      setMessages(prev => prev.filter(msg => String(msg.id) !== String(messageId)));
      setActionLoading(null);
      setNotifications(prev => prev.filter(n => n.type !== 'process'));
      addNotification('Message deleted successfully', 'success');
      playSound('success');
    });

    socketInstance.on('message-edited', (updatedMessage) => {
      setMessages(prev => prev.map(msg =>
        String(msg.id) === String(updatedMessage.id) ? { 
          ...msg, 
          message: updatedMessage.message, 
          edited_at: updatedMessage.edited_at 
        } : msg
      ));
      setEditingMessage(null);
      setEditText('');
      setActionLoading(null);
      addNotification('Message edited successfully', 'success');
      playSound('success');
    });

    socketInstance.on('message-error', ({ error, messageId, tempId }) => {
      console.error('Socket message error:', error);
      addNotification(`Error: ${error}`, 'error');
      playSound('error');
      if (tempId) {
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
      }
      setActionLoading(null);
    });

    socketInstance.on('user-typing', ({ userId, typing, username }) => {
      if (userId !== user.id) {
        setTypingUsers(prev => {
          const newSet = new Set(prev);
          const displayName = username || users.find(u => u.id === userId)?.username || `User ${userId}`;
          if (typing) {
            newSet.add(displayName);
          } else {
            newSet.delete(displayName);
          }
          return newSet;
        });
      }
    });

    socketInstance.on('user-status-change', ({ userId, status }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        status === 'online' ? newSet.add(userId) : newSet.delete(userId);
        return newSet;
      });
    });

    // When server sends reaction update, normalize and replace authoritative state
    socketInstance.on('reaction-added', ({ messageId, reactions }) => {
      const normalized = normalizeReactions(reactions);
      setMessages(prev => prev.map(msg =>
        String(msg.id) === String(messageId) ? { ...msg, reactions: normalized } : msg
      ));
    });

    setSocket(socketInstance);
    return () => {
      socketInstance.disconnect();
      if (currentAudio) {
        currentAudio.pause();
        setCurrentAudio(null);
        setPlayingVoice(null);
      }
    };
  }, [user.id, selectedChat]);

  useEffect(() => { fetchUsers(); }, []);
  useEffect(() => { 
    fetchMessages();
    const chatKey = selectedChat.type === 'general' ? 'general' : `private-${selectedChat.data?.id}`;
    setUnreadCounts(prev => ({ ...prev, [chatKey]: 0 }));
  }, [selectedChat]);

  // UPDATED: only auto-scroll when shouldScrollRef.current is true.
  useEffect(() => { 
    if (shouldScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      shouldScrollRef.current = false;
    }
  }, [messages]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get(`${URL}/api/messages/users`);
      setUsers(res.data.filter(u => u.id !== user.id));
    } catch (err) {
      console.error('Fetch users error:', err);
      addNotification('Failed to load users', 'error');
    }
  };

  const fetchMessages = async () => {
    try {
      setLoading(true);
      let endpoint = `${URL}/api/messages/general`;
      
      if (selectedChat.type === "private" && selectedChat.data) {
        endpoint = `${URL}/api/messages/private/${selectedChat.data.id}?currentUserId=${user.id}`;
      }
      
      const res = await axios.get(endpoint);
      // normalize reactions for each message so frontend always sees an array
      const normalized = (res.data || []).map(m => ({
        ...m,
        reactions: normalizeReactions(m.reactions)
      }));
      setMessages(normalized);
      // NEW: when loading messages (initial load or switching chats), scroll to bottom
      shouldScrollRef.current = true;
    } catch (err) {
      console.error('Fetch messages error:', err);
      setMessages([]);
      addNotification('Failed to load messages', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!msgInput.trim()) return;

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      message: msgInput,
      sender_id: user.id,
      sender_name: user.username,
      created_at: new Date().toISOString(),
      message_type: 'text',
      status: 'sending',
      reply_to: replyingTo?.id || null,
      recipient_id: selectedChat.type === 'private' ? selectedChat.data?.id : null
    };

    // NEW: user is sending — next messages update should scroll to bottom
    shouldScrollRef.current = true;

    setMessages(prev => [...prev, tempMessage]);
    playSound('send');

    if (socket && socket.connected) {
      socket.emit('send-message', {
        tempId,
        sender_id: user.id,
        message: msgInput,
        chatType: selectedChat.type,
        recipient_id: selectedChat.data?.id,
        replyTo: replyingTo?.id,
        message_type: 'text'
      });
    } else {
      addNotification('Not connected to server', 'error');
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
    }

    setMsgInput("");
    setReplyingTo(null);
    handleStopTyping();
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  // ADDED: send reply for a specific message (optimistic UI)
  const handleSendReply = async (e, message) => {
    e.preventDefault();
    const text = (replyInputs?.[message.id] || "").trim();
    if (!text) return;

    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      message: text,
      sender_id: user.id,
      sender_name: user.username,
      created_at: new Date().toISOString(),
      message_type: 'text',
      status: 'sending',
      reply_to: message.id,
      recipient_id: selectedChat.type === 'private' ? selectedChat.data?.id : null
    };

    // NEW: user replied — scroll to bottom on next messages update
    shouldScrollRef.current = true;

    // optimistic UI
    setMessages(prev => [...prev, tempMessage]);
    playSound('send');

    if (socket && socket.connected) {
      socket.emit('send-message', {
        tempId,
        sender_id: user.id,
        message: text,
        chatType: selectedChat.type,
        recipient_id: selectedChat.data?.id,
        replyTo: message.id,
        message_type: 'text'
      });
    } else {
      addNotification('Not connected to server', 'error');
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }

    // clear input for that message and hide inline reply UI
    setReplyInputs(prev => {
      const copy = { ...prev };
      delete copy[message.id];
      return copy;
    });
    setReplyingTo(null);
  };

  // FIXED: WhatsApp-style auto-resize textarea
  const handleTyping = (value) => {
    setMsgInput(value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = Math.min(scrollHeight, 120) + 'px';
    }
    
    if (!isTyping && value.trim()) {
      setIsTyping(true);
      socket?.emit('typing-start', { 
        userId: user.id, 
        username: user.username,
        chatType: selectedChat.type,
        recipientId: selectedChat.data?.id
      });
    }
    
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      handleStopTyping();
    }, 3000);
  };

  const handleStopTyping = () => {
    if (isTyping) {
      setIsTyping(false);
      socket?.emit('typing-stop', { 
        userId: user.id,
        username: user.username, 
        chatType: selectedChat.type,
        recipientId: selectedChat.data?.id
      });
    }
  };

  // FIXED: Scroll to input on mobile
  const handleInputFocus = () => {
    if (window.innerWidth <= 768) {
      setTimeout(() => {
        const composer = document.querySelector('.composer');
        if (composer) {
          composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 300);
    }
  };

  const handleMenuAction = (action, message) => {
    setActiveMenu(null);
    
    switch(action) {
      case 'reply':
        setReplyingTo(message);
        break;
      case 'edit':
        setEditingMessage(message.id);
        setEditText(message.message);
        break;
      case 'delete':
        setShowDeleteModal(message);
        break;
      case 'react':
        handleReaction(message.id, '❤️');
        break;
    }
  };

  const handleEdit = async (messageId) => {
    if (!editText.trim()) {
      addNotification('Message cannot be empty', 'error');
      return;
    }
    
    setActionLoading(`edit-${messageId}`);
    
    if (socket && socket.connected) {
      socket.emit('edit-message', { messageId, newMessage: editText });
    } else {
      addNotification('Not connected to server', 'error');
      setActionLoading(null);
    }
  };

  const handleEditKeyDown = (e, messageId) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEdit(messageId);
    }
  };

  // FIXED: Show process notification
  const handleDelete = async (messageId) => {
    setActionLoading(`delete-${messageId}`);
    addNotification('Deleting message...', 'process');
    
    if (socket && socket.connected) {
      socket.emit('delete-message', { messageId });
    } else {
      addNotification('Not connected to server', 'error');
      setActionLoading(null);
    }
    
    setShowDeleteModal(null);
  };

  // CHANGED: include chat context so server can validate add-reaction on other users' messages
  const handleReaction = (messageId, emoji) => {
    if (!socket || !socket.connected) {
      addNotification('Not connected to server', 'error');
      return;
    }

    // OPTIMISTIC UI: toggle reaction locally immediately for snappy UX
    setMessages(prev => prev.map(msg => {
      if (String(msg.id) !== String(messageId)) return msg;

      // ensure reactions is an array locally
      const currentReactions = Array.isArray(msg.reactions) ? [...msg.reactions] : normalizeReactions(msg.reactions);

      const existing = currentReactions.find(r => r.user_id === user.id && r.emoji === emoji);
      let newReactions;
      if (existing) {
        newReactions = currentReactions.filter(r => !(r.user_id === user.id && r.emoji === emoji));
      } else {
        newReactions = [...currentReactions, { user_id: user.id, emoji }];
      }
      return { ...msg, reactions: newReactions };
    }));

    // send to server; if server supports ACK, revert on error by refetching the single chat messages
    socket.emit('add-reaction', {
      messageId,
      emoji,
      userId: user.id,
      chatType: selectedChat.type,
      recipientId: selectedChat.data?.id || null
    }, (ack) => {
      if (ack && ack.error) {
        addNotification('Failed to add reaction: ' + ack.error, 'error');
        // revert by refetching current chat messages (simple and safe)
        fetchMessages();
      }
    });
  };
  

  const handleFileUpload = async (file, type) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      addNotification('File too large (max 10MB)', 'error');
      return;
    }

    if (type === 'image') {
      const reader = new FileReader();
      reader.onload = (e) => {
        setFilePreview({
          type: 'image',
          file,
          preview: e.target.result,
          name: file.name,
          size: (file.size / 1024).toFixed(1) + ' KB'
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    setFilePreview({
      type: 'file',
      file,
      name: file.name,
      size: (file.size / 1024).toFixed(1) + ' KB'
    });
  };

  const sendFileMessage = async () => {
    if (!filePreview) return;

    setUploadLoading(true);
    
    const tempId = `temp-${Date.now()}`;
    const tempMessage = {
      id: tempId,
      message: filePreview.name,
      sender_id: user.id,
      sender_name: user.username,
      created_at: new Date().toISOString(),
      message_type: filePreview.type,
      status: 'sending',
      recipient_id: selectedChat.type === 'private' ? selectedChat.data?.id : null,
      media_url: filePreview.type === 'image' ? filePreview.preview : null
    };
    
    // NEW: user sending file — scroll to bottom on next messages update
    shouldScrollRef.current = true;

    setMessages(prev => [...prev, tempMessage]);
    setFilePreview(null);
    
    try {
      const formData = new FormData();
      formData.append('file', filePreview.file);
      formData.append('sender_id', user.id);
      formData.append('chatType', selectedChat.type);
      formData.append('message_type', filePreview.type);
      
      if (selectedChat.type === 'private') {
        formData.append('recipient_id', selectedChat.data.id);
      }

      const response = await axios.post(`${URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        playSound('send');
        setMessages(prev => prev.map(msg =>
          msg.id === tempId ? {
            ...msg,
            id: response.data.message.id,
            media_url: response.data.message.media_url,
            status: 'delivered'
          } : msg
        ));
        addNotification(`${filePreview.type === 'image' ? 'Image' : 'File'} sent successfully`, 'success');
      }
    } catch (err) {
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      addNotification('Upload failed: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setUploadLoading(false);
    }
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true } 
      });
      const recorder = new MediaRecorder(stream);
      
      setMediaRecorder(recorder);
      setIsRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        
        const tempId = `temp-${Date.now()}`;
        const tempMessage = {
          id: tempId,
          message: `Voice note (${recordingTime}s)`,
          sender_id: user.id,
          sender_name: user.username,
          created_at: new Date().toISOString(),
          message_type: 'voice',
          voice_duration: recordingTime,
          status: 'sending',
          recipient_id: selectedChat.type === 'private' ? selectedChat.data?.id : null
        };
        
        // NEW: sending voice — scroll to bottom next update
        shouldScrollRef.current = true;

        setMessages(prev => [...prev, tempMessage]);
        
        const formData = new FormData();
        formData.append('file', blob, `voice-${Date.now()}.webm`);
        formData.append('sender_id', user.id);
        formData.append('chatType', selectedChat.type);
        formData.append('message_type', 'voice');
        formData.append('voice_duration', recordingTime);
        
        if (selectedChat.type === 'private') {
          formData.append('recipient_id', selectedChat.data.id);
        }

        try {
          const response = await axios.post(`${URL}/api/upload`, formData);
          
          if (response.data.success) {
            playSound('send');
            setMessages(prev => prev.map(msg =>
              msg.id === tempId ? {
                ...msg,
                id: response.data.message.id,
                media_url: response.data.message.media_url,
                status: 'delivered'
              } : msg
            ));
            addNotification('Voice message sent', 'success');
          }
        } catch (err) {
          setMessages(prev => prev.filter(msg => msg.id !== tempId));
          addNotification('Voice upload failed', 'error');
        }
      };

      recorder.start();
      playSound('notification');
      addNotification('Recording voice message...', 'info');
    } catch (err) {
      addNotification('Could not access microphone', 'error');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      clearInterval(recordingIntervalRef.current);
      setIsRecording(false);
      setMediaRecorder(null);
      setRecordingTime(0);
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      clearInterval(recordingIntervalRef.current);
      setIsRecording(false);
      setMediaRecorder(null);
      setRecordingTime(0);
      addNotification('Voice recording cancelled', 'info');
    }
  };

  const toggleVoicePlayback = (message) => {
    if (!message.media_url) return;
    
    if (playingVoice === message.id && currentAudio) {
      if (!currentAudio.paused) {
        currentAudio.pause();
        return;
      } else {
        currentAudio.play();
        return;
      }
    }
    
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
      setCurrentAudio(null);
      setPlayingVoice(null);
      setAudioCurrentTime(0);
    }
    
    const audio = new Audio(`${URL}${message.media_url}`);
    setCurrentAudio(audio);
    setPlayingVoice(message.id);
    
    audio.addEventListener('timeupdate', () => {
      setAudioCurrentTime(Math.floor(audio.currentTime));
    });
    
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(Math.floor(audio.duration));
    });
    
    audio.onended = () => {
      setPlayingVoice(null);
      setCurrentAudio(null);
      setAudioCurrentTime(0);
    };
    
    audio.onerror = () => {
      console.error('Audio playback failed');
      setPlayingVoice(null);
      setCurrentAudio(null);
      setAudioCurrentTime(0);
      addNotification('Audio playback failed', 'error');
    };
    
    audio.play().catch(err => {
      console.error('Audio play failed:', err);
      setPlayingVoice(null);
      setCurrentAudio(null);
      addNotification('Cannot play audio', 'error');
    });
  };

  const toggleTheme = () => {
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  };

  const toggleSidebar = () => {
    document.body.classList.toggle('show-sidebar');
  };

  const handleLogout = () => {
    if (socket) socket.disconnect();
    if (currentAudio) {
      currentAudio.pause();
      setCurrentAudio(null);
    }
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login");
  };

  const getInitials = (name) => {
    return name ? name.split(" ").map(n => n[0]).join("").toUpperCase() : "??";
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  // FIXED: Proper double tick status
  const renderMessageStatus = (message) => {
    if (message.sender_id !== user.id) return null;
    
    const isLoading = actionLoading === `delete-${message.id}`;
    
    if (isLoading) {
      return <div className="loading-spinner-small"></div>;
    }
    
    switch (message.status) {
      case 'sending':
        return <MdAccessTime className="status-sending" />;
      case 'sent':
        return <MdCheck className="status-sent" />;
      case 'delivered':
        return <MdDoneAll className="status-delivered" />;
      case 'seen':
        return <MdDoneAll className="status-seen" />;
      default:
        return <MdDoneAll className="status-delivered" />;
    }
  };

  const shouldInlineMessage = (messageText, messageType) => {
    if (messageType !== 'text') return false;
    return messageText.length <= 30;
  };

  const groupedMessages = messages.reduce((groups, message) => {
    const date = formatMessageDate(message.created_at);
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(message);
    return groups;
  }, {});

  return (
    <div className="app">
      {connectionStatus !== 'connected' && (
        <div className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'connecting' && 'Connecting...'}
          {connectionStatus === 'disconnected' && 'Reconnecting...'}
          {connectionStatus === 'error' && 'Connection failed'}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="notification-container">
          {notifications.map(notification => (
            <div key={notification.id} className={`notification ${notification.type}`}>
              <div className="notification-content">
                <div className={`notification-icon ${notification.type === 'process' ? 'spinning' : ''}`}>
                  {notification.type === 'success' && <MdCheck />}
                  {notification.type === 'error' && <MdClose />}
                  {notification.type === 'info' && <MdNotifications />}
                  {notification.type === 'process' && <div className="loading-spinner-small"></div>}
                </div>
                <div className="notification-text">{notification.message}</div>
                <button 
                  onClick={() => setNotifications(prev => prev.filter(n => n.id !== notification.id))}
                  className="notification-close"
                >
                  <MdClose />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading messages...</div>
        </div>
      )}

      {filePreview && (
        <div className="modal-overlay" onClick={() => setFilePreview(null)}>
          <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="preview-header">
              <h3>Send {filePreview.type === 'image' ? 'Image' : 'File'}</h3>
              <button onClick={() => setFilePreview(null)} className="close-btn">
                <MdClose />
              </button>
            </div>
            
            <div className="preview-content">
              {filePreview.type === 'image' ? (
                <img 
                  src={filePreview.preview} 
                  alt={filePreview.name}
                  className="preview-image"
                />
              ) : (
                <div className="preview-file">
                  <MdDescription className="file-icon-large" />
                  <div className="file-details">
                    <div className="file-name">{filePreview.name}</div>
                    <div className="file-size">{filePreview.size}</div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="preview-actions">
              <button onClick={() => setFilePreview(null)} className="btn-cancel">
                Cancel
              </button>
              <button 
                onClick={sendFileMessage} 
                className="btn-send" 
                disabled={uploadLoading}
              >
                {uploadLoading ? (
                  <div className="action-loading">
                    <div className="loading-spinner-small"></div>
                    Sending...
                  </div>
                ) : (
                  'Send'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Delete Message</h3>
            <p>Are you sure you want to delete this message? This action cannot be undone.</p>
            <div className="modal-actions">
              <button 
                onClick={() => setShowDeleteModal(null)} 
                className="btn-cancel"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button 
                onClick={() => handleDelete(showDeleteModal.id)} 
                className="btn-delete"
                disabled={actionLoading}
              >
                {actionLoading === `delete-${showDeleteModal.id}` ? (
                  <div className="action-loading">
                    <div className="loading-spinner-small"></div>
                    Deleting...
                  </div>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="topbar" style={{ position: 'sticky', top: 0, zIndex: 1000 }}>
        <div className="brand">
          <button className="menu-btn" onClick={toggleSidebar}>
            <MdMenu />
          </button>
          <div className="logo">Welcome</div>
          <span className="username">@{user.username}</span>
        </div>
        <div className="actions">
          <button className="icon-btn" onClick={toggleTheme}>
            <MdOutlineModeNight className="dark-icon" />
            <MdOutlineWbSunny className="light-icon" />
          </button>
          <button className="icon-btn-logout logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="main">
        <aside className="sidebar">
          <div className="chats">
            <div 
              className={`chat-item ${selectedChat.type === 'general' ? 'active' : ''}`}
              onClick={() => {
                setSelectedChat({ type: "general", data: null });
                if (window.innerWidth <= 768) toggleSidebar();
              }}
            >
              <div className="avatar cyan-purple-gradient">🌍</div>
              <div className="chat-info">
                <div className="name">
                  General Chat
                  <span className="chat-badge general">Public</span>
                </div>
                <div className="preview">Everyone can see messages</div>
              </div>
              {unreadCounts.general > 0 && (
                <div className="unread-badge">{unreadCounts.general}</div>
              )}
            </div>

            {users.map(u => {
              const unreadKey = `private-${u.id}`;
              const unreadCount = unreadCounts[unreadKey] || 0;
              
              return (
                <div 
                  key={u.id} 
                  className={`chat-item ${selectedChat.type === 'private' && selectedChat.data?.id === u.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedChat({ type: "private", data: u });
                    if (window.innerWidth <= 768) toggleSidebar();
                  }}
                >
                  <div className="avatar cyan-purple-gradient">
                    {getInitials(u.username)}
                  </div>
                  <div className="chat-info">
                    <div className="name">
                      {u.username}
                      {onlineUsers.has(u.id) && <span className="online-dot"></span>}
                      <span className="chat-badge private">Private</span>
                    </div>
                    <div className="preview">
                      {onlineUsers.has(u.id) ? 'Online now' : 'Tap to chat'}
                    </div>
                  </div>
                  {unreadCount > 0 && (
                    <div className="unread-badge">{unreadCount}</div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="chat">
          <div className="chat-header">
            <button className="go-back-btn" onClick={toggleSidebar}>
              <MdArrowBackIos />
            </button>
            <div className="avatar cyan-purple-gradient">
              {selectedChat.type === 'general' ? '🌍' : getInitials(selectedChat.data?.username)}
            </div>
            <div className="chat-title">
              <div className="name">
                {selectedChat.type === 'general' 
                  ? 'General Chat' 
                  : selectedChat.data?.username || 'Private Chat'}
                {selectedChat.type === 'private' && selectedChat.data && onlineUsers.has(selectedChat.data.id) && (
                  <span className="online-dot"></span>
                )}
              </div>
              {typingUsers.size > 0 && (
                <div className="typing-indicator">
                  <span>
                    {typingUsers.size === 1 
                      ? `${Array.from(typingUsers)[0]} is typing` 
                      : typingUsers.size === 2 
                        ? `${Array.from(typingUsers).join(' and ')} are typing`
                        : `${typingUsers.size} people are typing`
                    }
                  </span>
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="messages">
            {Object.keys(groupedMessages).length === 0 ? (
              <div className="empty-chat-state">
                <div className="empty-icon">💬</div>
                <h3>Start the conversation</h3>
                <p>Send a message to begin!</p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, dateMessages]) => (
                <div key={date}>
                  <div className="date-separator">
                    <span>{date}</span>
                  </div>
                  
                  {dateMessages.map(m => {
                    const isOwn = m.sender_id === user.id;
                    const replyMessage = m.reply_to ? messages.find(msg => String(msg.id) === String(m.reply_to)) : null;
                    const isInline = shouldInlineMessage(m.message, m.message_type);
                    
                    return (
                      <div 
                        key={m.id} 
                        className={`message-wrapper ${isOwn ? 'own' : ''}`}
                        ref={el => messagesRefs.current[m.id] = el}
                      >
                        <div className="message-bubble">
                          {editingMessage === m.id ? (
                            <div className="edit-container">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => handleEditKeyDown(e, m.id)}
                                className="edit-input"
                                placeholder="Edit your message..."
                                autoFocus
                              />
                              <div className="edit-actions">
                                <button 
                                  onClick={() => {
                                    setEditingMessage(null);
                                    setEditText('');
                                  }}
                                  className="btn-cancel"
                                  disabled={actionLoading === `edit-${m.id}`}
                                >
                                  Cancel
                                </button>
                                <button 
                                  onClick={() => handleEdit(m.id)} 
                                  className="btn-save"
                                  disabled={!editText.trim() || actionLoading === `edit-${m.id}`}
                                >
                                  {actionLoading === `edit-${m.id}` ? (
                                    <div className="action-loading">
                                      <div className="loading-spinner-small"></div>
                                      Saving...
                                    </div>
                                  ) : (
                                    'Save'
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="message-content">
                                {replyMessage && (
                                  <div 
                                    className="reply-preview"
                                    onClick={() => scrollToMessage(replyMessage.id)}
                                  >
                                    <span className="reply-author">
                                      {replyMessage.sender_id === user.id ? 'You' : replyMessage.sender_name}
                                    </span>
                                    <span className="reply-text">
                                      {replyMessage.message_type === 'text' 
                                        ? (replyMessage.message.length > 50 ? replyMessage.message.slice(0, 50) + '...' : replyMessage.message)
                                        : `${replyMessage.message_type} message`
                                      }
                                    </span>
                                  </div>
                                )}

                                <div className={`message-header ${isInline ? 'inline' : 'multiline'}`}>
                                  <span className="sender-name">{isOwn ? 'You' : m.sender_name}{isInline ? ':' : ''}</span>
                                  
                                  {m.message_type === 'voice' ? (
                                    <div className="voice-player">
                                      <button 
                                        className="play-btn"
                                        onClick={() => toggleVoicePlayback(m)}
                                        disabled={!m.media_url}
                                      >
                                        {playingVoice === m.id && currentAudio && !currentAudio.paused ? <MdPause /> : <MdPlayArrow />}
                                      </button>
                                      <div className="voice-waveform">
                                        <div className={`wave-animation ${playingVoice === m.id && currentAudio && !currentAudio.paused ? 'playing' : ''}`}>
                                          {[...Array(8)].map((_, i) => (
                                            <div 
                                              key={i} 
                                              className="wave-bar"
                                              style={{ 
                                                animationDelay: `${i * 0.1}s`,
                                                height: playingVoice === m.id && currentAudio && !currentAudio.paused ? `${8 + Math.random() * 10}px` : '8px'
                                              }}
                                            ></div>
                                          ))}
                                        </div>
                                      </div>
                                      <span className="voice-time">
                                        {playingVoice === m.id ? 
                                          `${formatTime(audioCurrentTime)}/${formatTime(m.voice_duration || audioDuration)}` :
                                          formatTime(m.voice_duration || 0)
                                        }
                                      </span>
                                    </div>
                                  ) : m.message_type === 'image' ? (
                                    <>
                                      {!isInline && <br />}
                                      <div className="image-message">
                                        <img 
                                          src={`${URL}${m.media_url}`}
                                          alt="Shared"
                                          className="message-image"
                                          onClick={() => window.open(`${URL}${m.media_url}`, '_blank')}
                                        />
                                      </div>
                                    </>
                                  ) : m.message_type === 'file' ? (
                                    <>
                                      {!isInline && <br />}
                                      <div className="file-message">
                                        <MdAttachFile className="file-icon" />
                                        <div className="file-info">
                                          <span className="file-name">{m.message}</span>
                                          <span className="file-size">Click to download</span>
                                        </div>
                                        <a 
                                          href={`${URL}${m.media_url}`}
                                          download
                                          className="download-btn"
                                        >
                                          <MdDownload />
                                        </a>
                                      </div>
                                    </>
                                  ) : (
                                    <span className="message-text">{m.message}</span>
                                  )}
                                </div>

                                <div className="message-footer">
                                  <div className="message-time-info">
                                    <span className="message-time">
                                      {new Date(m.created_at).toLocaleTimeString('en-US', {
                                        hour: 'numeric',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                    {m.edited_at && (
                                      <span className="edited-indicator">edited</span>
                                    )}
                                  </div>
                                  
                                  <div className="message-actions">
                                    {isOwn && (
                                      <div className="message-status">
                                        {renderMessageStatus(m)}
                                      </div>
                                    )}

                                    <div className="message-menu-container">
                                      <button 
                                        className="message-menu-btn" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenu(activeMenu === m.id ? null : m.id);
                                        }}
                                      >
                                        <MdMoreVert />
                                      </button>
                                      
                                      {activeMenu === m.id && (
                                        <div className="message-menu">
                                          {!isOwn && (
                                            <button onClick={() => handleMenuAction('reply', m)}>
                                              <MdOutlineReply /> Reply
                                            </button>
                                          )}
                                          <button onClick={() => handleMenuAction('react', m)}>
                                            <MdFavorite /> React
                                          </button>
                                          {isOwn && m.message_type === 'text' && (
                                            <button onClick={() => handleMenuAction('edit', m)}>
                                              <MdOutlineEdit /> Edit
                                            </button>
                                          )}
                                          {(isOwn || selectedChat.type === 'general') && (
                                            <button onClick={() => handleMenuAction('delete', m)}>
                                              <MdOutlineDelete /> Delete
                                            </button>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* --- Per-message reply form: appears at the bottom of the specific message being replied to --- */}
                                {replyingTo?.id === m.id && (
                                  <form className="reply-box" onSubmit={(e) => handleSendReply(e, m)}>
  <textarea
    className="form-control reply-textarea"
    placeholder={`Reply to ${m.sender_name}...`}
    value={replyInputs?.[m.id] || ""}
    onChange={(e) => setReplyInputs(prev => ({ ...prev, [m.id]: e.target.value }))}
    rows={3}
    style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #ddd' }}
  />
  <div className="reply-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
    <button type="submit" className="btn btn-primary" disabled={!replyInputs?.[m.id]?.trim()}>
      Send
    </button>
    <button type="button" className="btn btn-outline-danger" onClick={() => setReplyingTo(null)}>
      Cancel
    </button>
  </div>
</form>
                                )}
                                {/* --- End per-message reply form --- */}

                              </div>

                              {m.reactions && Array.isArray(m.reactions) && m.reactions.length > 0 && (
                                <div className="message-reactions">
                                  {m.reactions.reduce((acc, reaction) => {
                                    const existing = acc.find(r => r.emoji === reaction.emoji);
                                    if (existing) {
                                      existing.count++;
                                      if (reaction.user_id === user.id) existing.byMe = true;
                                    } else {
                                      acc.push({
                                        emoji: reaction.emoji,
                                        count: 1,
                                        byMe: reaction.user_id === user.id
                                      });
                                    }
                                    return acc;
                                  }, []).map((reaction, idx) => (
                                    <button
                                      key={idx}
                                      className={`reaction ${reaction.byMe ? 'by-me' : ''}`}
                                      onClick={() => handleReaction(m.id, reaction.emoji)}
                                    >
                                      {reaction.emoji} {reaction.count}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="composer" onSubmit={handleSendMessage}>
            {!isRecording && (
              <div className="mobile-media-menu">
                <button 
                  type="button" 
                  className={`mobile-toggle-btn ${showMediaMenu ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMediaMenu(!showMediaMenu);
                  }}
                  disabled={uploadLoading}
                  aria-label="Media options"
                >
                  <MdAdd />
                </button>
                
                {showMediaMenu && (
                  <div className="media-options">
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        imageInputRef.current?.click();
                        setShowMediaMenu(false);
                      }}
                    >
                      <MdImage /> Image
                    </button>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                        setShowMediaMenu(false);
                      }}
                    >
                      <MdAttachFile /> File
                    </button>
                    <button 
                      type="button" 
                      onClick={(e) => {
                        e.stopPropagation();
                        startVoiceRecording();
                        setShowMediaMenu(false);
                      }}
                    >
                      <MdMic /> Voice
                    </button>
                  </div>
                )}
              </div>
            )}

            {isRecording && (
              <div className="recording-controls">
                <div className="recording-indicator">
                  <div className="recording-dot"></div>
                  <span className="recording-time">
                    {formatTime(recordingTime)}
                  </span>
                </div>
                <button 
                  type="button" 
                  onClick={stopVoiceRecording}
                  title="Send voice message"
                >
                  <MdSend />
                </button>
                <button 
                  type="button" 
                  onClick={cancelVoiceRecording}
                  title="Cancel recording"
                >
                  <MdClose />
                </button>
              </div>
            )}

            <div className="composer-main">
              <textarea
                ref={textareaRef}
                className="message-input"
                value={msgInput}
                onChange={(e) => handleTyping(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleStopTyping}
                onFocus={handleInputFocus}
                placeholder={
                  replyingTo 
                    ? `Reply to ${replyingTo.sender_name}...`
                    : selectedChat.type === 'general' 
                      ? "Message everyone..." 
                      : `Message ${selectedChat.data?.username}...`
                }
                rows={1}
                disabled={isRecording || uploadLoading}
                style={{ height: '44px', resize: 'none' }}
              />
            </div>
            
            <button 
              type="submit" 
              className="send-btn" 
              disabled={!msgInput.trim() || isRecording || uploadLoading}
              title="Send message"
            >
              {uploadLoading ? (
                <div className="loading-spinner-small"></div>
              ) : (
                <MdSend />
              )}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  handleFileUpload(file, 'file');
                  e.target.value = '';
                }
              }}
              accept="*/*"
            />
            <input
              ref={imageInputRef}
              type="file"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files[0];
                if (file) {
                  handleFileUpload(file, 'image');
                  e.target.value = '';
                }
              }}
              accept="image/*"
            />
          </form>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
