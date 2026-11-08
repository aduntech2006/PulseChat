// frontend/src/components/chat/FileUpload.jsx
import { useRef } from 'react';
import { MdAttachFile, MdImage } from 'react-icons/md';
import axios from 'axios';

const FileUpload = ({ selectedChat, user, onMessageSent }) => {
  const fileInputRef = useRef();
  const imageInputRef = useRef();

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleImageSelect = () => {
    imageInputRef.current?.click();
  };

  const uploadFile = async (file, type) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sender_id', user.id);
      formData.append('chatType', selectedChat.type);
      formData.append('message_type', type);
      
      if (selectedChat.type === 'private') {
        formData.append('recipient_id', selectedChat.data.id);
      }

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (response.data.success) {
        onMessageSent(response.data.message);
      }
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await uploadFile(file, 'file');
      e.target.value = '';
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      await uploadFile(file, 'image');
      e.target.value = '';
    }
  };

  return (
    <>
      <button type="button" className="upload-btn" onClick={handleFileSelect}>
        <MdAttachFile />
      </button>
      <button type="button" className="upload-btn" onClick={handleImageSelect}>
        <MdImage />
      </button>
      
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept="*/*"
      />
      <input
        ref={imageInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleImageChange}
        accept="image/*"
      />
    </>
  );
};

export default FileUpload;