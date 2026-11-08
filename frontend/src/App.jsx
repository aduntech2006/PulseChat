import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Dashboard from './components/chat/Dashboard';
import Login from './components/auth/Login';
import Signup from './components/auth/Signup';
import 'bootstrap/dist/css/bootstrap.min.css';

import './styles/chat.css'; // Make sure this file exists with all the CSS

function App() {
  // Initialize theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark');
    }
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="*" element={<Login />} />
      </Routes>
    </Router>
  );
}

export default App;