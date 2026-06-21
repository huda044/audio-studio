import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import ErrorBoundary from './ErrorBoundary.jsx';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
