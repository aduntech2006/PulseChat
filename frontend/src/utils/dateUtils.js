
// frontend/src/utils/dateUtils.js
export const groupMessagesByDate = (messages) => {
  const groups = [];
  let currentDate = null;
  
  messages.forEach(message => {
    const messageDate = new Date(message.created_at).toDateString();
    
    if (messageDate !== currentDate) {
      currentDate = messageDate;
      const today = new Date().toDateString();
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      
      let dateLabel = messageDate;
      if (messageDate === today) dateLabel = 'Today';
      else if (messageDate === yesterday) dateLabel = 'Yesterday';
      else {
        const date = new Date(message.created_at);
        dateLabel = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
      }
      
      groups.push({ type: 'date', label: dateLabel });
    }
    
    groups.push({ type: 'message', data: message });
  });
  
  return groups;
};
