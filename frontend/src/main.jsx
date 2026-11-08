// ✅ Polyfill to prevent Axios fetch adapter error on Vercel/GitHub
if (typeof globalThis === "undefined") {
  window.globalThis = window;
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
