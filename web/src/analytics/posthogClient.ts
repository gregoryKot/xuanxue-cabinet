// Единственный модуль, который импортирует `posthog-js` (ADR-0143) — грузится
// только динамическим `import('./posthogClient')` из useAnalytics.ts, чтобы
// не попасть в стартовый бандл (check-bundle-size.mjs). Recorder — тоже
// импортом, не скриптом с чужого домена: CSP (connectSrc) пускает только сам
// POSTHOG_HOST, а `disable_external_dependency_loading` в posthogOptions.ts
// не даёт posthog-js попытаться догрузить его откуда-то ещё.
import posthog from 'posthog-js';
import 'posthog-js/dist/recorder';
import { buildPosthogOptions } from './posthogOptions';
import { isRecordingAllowed } from './analyticsPrivacy';

let started = false;

/** Личные свойства для identify() — только id и признаки роли/статуса
 * (MeDto), никогда имя, email или telegram (ADR-0143, минимум персональных
 * данных). Вызывающий (useAnalytics.ts) собирает объект сам из `MeDto`. */
export interface AnalyticsPersonProps {
  roles: string[];
  status: string;
}

/** Один раз на сессию вкладки — повторный вызов (например, смена пути при
 * уже начатой аналитике) не пересоздаёт клиента. */
export function startAnalytics(
  key: string,
  userId: string,
  personProps: AnalyticsPersonProps,
): void {
  if (started) return;
  posthog.init(key, buildPosthogOptions());
  posthog.identify(userId, personProps);
  started = true;
}

/** Выход из кабинета (ok → guest, useAnalytics.ts) — новый человек за тем же
 * браузером не должен унаследовать чужой distinct_id и запись. */
export function reset(): void {
  if (!started) return;
  posthog.reset();
  started = false;
}

/** Вызывается при каждой смене пути (useAnalytics.ts) — на маршрутах со
 * значением-секретом в адресе (join/emailLogin/emailConfirm) запись
 * останавливается, на остальных — идёт, как задал session_recording. */
export function syncRecording(pathname: string): void {
  if (!started) return;
  const isAllowed = isRecordingAllowed(pathname);
  // Уже в нужном состоянии — не дёргаем: повторный start на каждом экране
  // перебивал бы остановку записи, сделанную в настройках проекта PostHog.
  if (isAllowed === posthog.sessionRecordingStarted()) return;
  if (isAllowed) posthog.startSessionRecording();
  else posthog.stopSessionRecording();
}
