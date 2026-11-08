// frontend/src/components/chat/VoiceRecorder.jsx
import { useState, useRef } from 'react';
import { MdMic, MdStop, MdSend, MdClose } from 'react-icons/md';

const VoiceRecorder = ({ selectedChat, user, onVoiceNoteSent }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const intervalRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      setMediaRecorder(recorder);
      setIsRecording(true);
      setDuration(0);

      intervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      recorder.start();
    } catch (err) {
      alert('Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      
      clearInterval(intervalRef.current);
      setIsRecording(false);
      setMediaRecorder(null);
      
      // Send voice note (placeholder)
      const voiceMessage = {
        id: `temp-${Date.now()}`,
        message: `Voice note (${duration}s)`,
        sender_id: user.id,
        sender_name: user.username,
        created_at: new Date().toISOString(),
        message_type: 'voice',
        voice_duration: duration
      };
      
      onVoiceNoteSent(voiceMessage);
      setDuration(0);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      
      clearInterval(intervalRef.current);
      setIsRecording(false);
      setMediaRecorder(null);
      setDuration(0);
    }
  };

  return (
    <div className="voice-recorder">
      {!isRecording ? (
        <button className="voice-btn" onClick={startRecording}>
          <MdMic />
        </button>
      ) : (
        <div className="recording-controls">
          <div className="recording-indicator">
            <div className="recording-dot"></div>
            <span>{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</span>
          </div>
          <button className="stop-btn" onClick={stopRecording}>
            <MdSend />
          </button>
          <button className="cancel-btn" onClick={cancelRecording}>
            <MdClose />
          </button>
        </div>
      )}
    </div>
  );
};

export default VoiceRecorder;