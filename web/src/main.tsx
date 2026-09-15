import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { matchRouteLoader } from './app/routeModules';
import './fonts';
import './pwa/standalone.css';
import './index.css';
import { unregisterServiceWorker } from './pwa/unregisterServiceWorker';

// Чанк текущего экрана — до первого рендера, а не после ответа про сессию.
// Измерено на проде 2026-09-15: TTFB 0.5–1.1 с, первый экран ждал пяти
// последовательных шагов, и чанк был четвёртым — React.lazy начинает его
// качать, только когда RequireAuth отрендерит <Outlet>, то есть уже получив
// ответ /api/auth/me. Здесь он летит параллельно с ним; повторный import()
// того же модуля в сеть не идёт, lazy() получит уже загруженный.
void matchRouteLoader(window.location.pathname)?.();

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
