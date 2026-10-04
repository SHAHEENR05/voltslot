import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/theme.css';
import './styles/app.css';
import App from './App.jsx';
import { ToastProvider } from './lib/toast.jsx';
import { AuthProvider } from './lib/auth.jsx';
import { ClockProvider } from './lib/clock.jsx';
import { ReferenceProvider } from './lib/reference.jsx';
import { BookingProvider } from './lib/booking.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ClockProvider>
            <ReferenceProvider>
              <BookingProvider>
                <App />
              </BookingProvider>
            </ReferenceProvider>
          </ClockProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
