import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import ErrorBoundary from './ErrorBoundary.jsx';
import App from './App.jsx';

// Tema awal sebelum render pertama (di module JS, bukan inline script — CSP
// server melarang script inline). Default: ikuti preferensi sistem.
try {
  const saved = localStorage.getItem('audio-studio-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = saved === 'dark' || saved === 'light' ? saved : (prefersDark ? 'dark' : 'light');
} catch {
  document.documentElement.dataset.theme = 'light';
}

// PWA: daftarkan service worker hanya di build produksi (dev tidak perlu cache).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Gagal mendaftar bukan hal fatal — app tetap jalan normal.
    });
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
