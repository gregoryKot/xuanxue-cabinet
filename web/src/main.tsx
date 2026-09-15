import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import './fonts';
import './pwa/standalone.css';
import './index.css';
import { unregisterServiceWorker } from './pwa/unregisterServiceWorker';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Не найден #root');

// Ремень к kill-switch web/public/sw.js (ADR-0032): снимает регистрацию
// и кеш ещё до того, как браузер сам решит перепроверить sw.js.
void unregisterServiceWorker();

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
