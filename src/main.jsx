import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App.jsx';
import './ui/styles.css';

const boot = document.getElementById('boot');
if (boot) {
  boot.style.opacity = '0';
  setTimeout(() => boot.remove(), 420);
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
