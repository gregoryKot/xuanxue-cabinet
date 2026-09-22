import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App';
import { matchRoute } from './app/routeMatch';
import { installGlobalErrorReporting } from './errors/globalErrorReporting';
import './fonts';
import './pwa/standalone.css';
import './index.css';
import { registerServiceWorker } from './pwa/registerServiceWorker';

// До первой же строчки остального кода (ADR-0071) — даже сбой прогрева
// чанка чуть ниже должен долететь до сервера.
installGlobalErrorReporting();

// Чанк текущего экрана — до первого рендера, а не после ответа про сессию.
// Измерено на проде 2026-09-15: TTFB 0.5–1.1 с, первый экран ждал пяти
// последовательных шагов, и чанк был четвёртым — React.lazy начинает его
// качать, только когда RequireAuth отрендерит <Outlet>, то есть уже получив
// ответ /api/auth/me. Здесь он летит параллельно с ним; повторный import()
// того же модуля в сеть не идёт, lazy() получит уже загруженный.
void matchRoute(window.location.pathname)?.load();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Не найден #root');

// Push-worker web/public/sw.js (ADR-0092) — регистрируем без запроса
// разрешения на уведомления (оно просится по кнопке, отдельный PR), но не
// молча в смысле «неважно, получилось ли»: отказ виден в консоли сразу же,
// а не только пять секунд спустя таймаутом на «Профиле» (баг с прода
// 2026-09-22, CLAUDE.md «тихий отказ — самая дорогая ошибка»).
void registerServiceWorker().then((registered) => {
  if (!registered) {
    console.warn(
      'Push-worker /sw.js не зарегистрировался — push-уведомления недоступны в этой вкладке.',
    );
  }
});

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
