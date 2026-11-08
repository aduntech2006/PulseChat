// frontend/src/components/chat/MessageBubble.jsx
import { useState } from 'react';
import { MdMoreVert, MdOutlineReply, MdOutlineEdit, MdOutlineDelete, MdSend, MdClose, MdMic, MdAttachFile } from 'react-icons/md';

const MessageBubble = ({ 
  message, 
  isOwn, 
  currentUser, 
  replyMessage, 
  isEditing, 
  editText, 
  onEdit, 
  onDelete, 
  onReply, 
  onEditStart, 
  onEditCancel, 
  onEditTextChange,
  replyInput,
  onReplyInputChange,
  onSendReply,
  showReplyBox,
  onCancelReply
}) => {
  const [showMenu, setShowMenu] = useState(false);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const closeMenu = () => setShowMenu(false);

  return (
    <div className={`message-bubble ${isOwn ? 'own' : ''}`}>
      {isEditing ? (
        <div className="edit-container">
          <input
            type="text"
            value={editText}
            onChange={(e) => onEditTextChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onEdit(message.id, editText)}
            className="edit-input"
          />
          <div className="edit-actions">
            <button onClick={() => onEdit(message.id, editText)} className="btn-send">
              <MdSend />
            </button>
            <button onClick={onEditCancel} className="btn-cancel">
              <MdClose />
            </button>
          </div>
        </div>
      ) : (
        <>
          {replyMessage && (
            <div className="reply-preview">
              <span className="reply-author">
                {replyMessage.sender_id === currentUser.id ? 'You' : replyMessage.sender_name}
              </span>
              <span className="reply-text">{replyMessage.message}</span>
            </div>
          )}

          <div className="message-content">
            <div className="message-header">
              <span className="sender-name">
                {isOwn ? 'You:' : `${message.sender_name}:`}
              </span>
              
              {message.message_type === 'voice' ? (
                <div className="voice-player">
                  <button className="play-btn">
                    <MdMic />
                  </button>
                  <div className="voice-info">
                    <div className="voice-waveform"></div>
                    <span className="voice-time">{message.voice_duration}s</span>
                  </div>
                </div>
              ) : message.message_type === 'image' ? (
                <div className="media-content">
                  <img 
                    src={`${import.meta.env.VITE_API_URL}${message.media_url}`}
                    alt={message.message}
                    className="message-image"
                  />
                </div>
              ) : message.message_type === 'file' ? (
                <div className="file-content">
                  <MdAttachFile className="file-icon" />
                  <span className="file-name">{message.message}</span>
                  <a 
                    href={`${import.meta.env.VITE_API_URL}${message.media_url}`}
                    download
                    className="download-btn"
                  >
                    ⬇
                  </a>
                </div>
              ) : (
                <span className="message-text">{message.message}</span>
              )}
            </div>

            <div className="message-footer">
              <span className="message-time">
                {new Date(message.created_at).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              {isOwn && (
                <span className="message-status">
                  {message.status === 'sending' && '↺'}
                  {message.status === 'sent' && '✓'}
                  {message.status === 'delivered' && '✓✓'}
                  {!message.status && '✓✓'}
                </span>
              )}
              <div className="message-menu-container">
                <button className="message-menu-btn" onClick={handleMenuClick}>
                  <MdMoreVert />
                </button>
                {showMenu && (
                  <div className="message-menu" onClick={closeMenu}>
                    <button onClick={() => { onReply(message); closeMenu(); }}>
                      <MdOutlineReply /> Reply
                    </button>
                    {isOwn && (
                      <button onClick={() => { onEditStart(message); closeMenu(); }}>
                        <MdOutlineEdit /> Edit
                      </button>
                    )}
                    <button onClick={() => { onDelete(message.id); closeMenu(); }}>
                      <MdOutlineDelete /> Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showReplyBox && (
            <form onSubmit={onSendReply} className="reply-box">
              <input
                type="text"
                value={replyInput}
                onChange={(e) => onReplyInputChange(e.target.value)}
                placeholder={`Reply to ${message.sender_name}...`}
                className="reply-input"
              />
              <div className="reply-actions">
                <button type="submit" disabled={!replyInput.trim()}>
                  <MdSend />
                </button>
                <button type="button" onClick={onCancelReply}>
                  <MdClose />
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};

export default MessageBubble;