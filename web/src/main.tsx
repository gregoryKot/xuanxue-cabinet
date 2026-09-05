import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UpdateToast } from './pwa/UpdateToast';
import './pwa/standalone.css';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Не найден #root');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
      <UpdateToast />
    </ErrorBoundary>
  </StrictMode>,
);
