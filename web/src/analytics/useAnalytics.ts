// PostHog только для вошедших (ADR-0143) — на экранах входа/приглашения в
// адресе бывают коды и токены, аналитике там нечего делать. Хук решает,
// грузить ли posthog-js вовсе (только если сервер отдал ключ), и держит его
// в синхронизации с путём и статусом сессии.
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import type { MeDto } from '@xuanxue/shared';
import { apiRoute } from '../api/apiRoute';
import { useAuth } from '../auth/AuthProvider';
import type * as PosthogClientModule from './posthogClient';

// Текст только в консоль разработчика — пользователю тут решать нечего,
// отсутствие аналитики не должно быть его заботой (ADR-0143).
const ANALYTICS_START_FAILED_MESSAGE =
  'PostHog: аналитика не запущена (сеть, конфигурация или загрузка модуля)';

function personPropsFor(me: MeDto): { roles: string[]; status: string } {
  // Только роль(и) и статус — ни имени, ни email, ни telegram (ADR-0143).
  return { roles: me.roles, status: me.status };
}

export function useAnalytics(): void {
  const { status, me } = useAuth();
  const location = useLocation();
  const clientRef = useRef<typeof PosthogClientModule | null>(null);
  const requestedConfig = useRef(false);
  // Ref, не state: асинхронный старт ниже должен видеть путь на момент
  // своего завершения, а не тот, что был на момент запуска эффекта — без
  // `location.pathname` в зависимостях верхнего эффекта (иначе
  // exhaustive-deps потребовал бы пересоздавать его при каждой смене
  // адреса, хотя гвард requestedConfig всё равно погасил бы повтор).
  const pathnameRef = useRef(location.pathname);
  pathnameRef.current = location.pathname;

  useEffect(() => {
    if (status !== 'ok' || !me) return;
    if (requestedConfig.current) return; // не переспрашиваем конфиг на каждый рендер
    requestedConfig.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const config = await apiRoute('GET /analytics/config');
        if (cancelled || !config.posthogKey) return;
        const client = await import('./posthogClient');
        if (cancelled) return;
        client.startAnalytics(config.posthogKey, me.id, personPropsFor(me));
        clientRef.current = client;
        // Путь мог смениться, пока грузился модуль (или это и есть первый
        // путь) — эффект смены пути ниже реагирует только на будущие смены.
        client.syncRecording(pathnameRef.current);
      } catch (err) {
        console.warn(ANALYTICS_START_FAILED_MESSAGE, err);
      }
    })();

    return () => {
      cancelled = true;
      // Старт не доехал (например, applyMe после сохранения профиля сменил
      // `me`, пока грузился конфиг) — следующий прогон эффекта должен
      // запросить заново, иначе аналитика тихо не запустится вовсе.
      if (!clientRef.current) requestedConfig.current = false;
    };
  }, [status, me]);

  // ok → guest (выход) — новый человек за тем же браузером не должен
  // унаследовать чужой distinct_id; следующий вход запросит конфиг заново.
  useEffect(() => {
    if (status === 'ok') return;
    if (!clientRef.current) return;
    clientRef.current.reset();
    clientRef.current = null;
    requestedConfig.current = false;
  }, [status]);

  useEffect(() => {
    clientRef.current?.syncRecording(location.pathname);
  }, [location.pathname]);
}
