
// frontend/src/components/chat/ConnectionStatus.jsx
const ConnectionStatus = ({ status }) => {
  if (status === 'connected') return null;

  return (
    <div className={`connection-status ${status}`}>
      {status === 'connecting' && 'Connecting...'}
      {status === 'reconnecting' && 'Reconnecting...'}
      {status === 'disconnected' && 'Disconnected'}
    </div>
  );
};

export default ConnectionStatus;