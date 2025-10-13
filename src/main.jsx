import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { UpProviderWrapper } from './context/UpContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <UpProviderWrapper>
      <App />
    </UpProviderWrapper>
  </React.StrictMode>
);