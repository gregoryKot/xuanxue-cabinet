// Настройки PostHog (ADR-0143) — вынесены из posthogClient.ts отдельным
// чистым файлом, чтобы их можно было протестировать без запуска самого
// posthog-js: `import type` стирается сборщиком, рантайм-импорт пакета
// остаётся только в posthogClient.ts.
import type { PostHogConfig } from 'posthog-js';
import { POSTHOG_HOST } from '@xuanxue/shared';
import { sanitizeEvent } from './analyticsPrivacy';

/**
 * Максимум приватности при минимуме отказа от полезности (ADR-0143):
 * - `mask_all_text`/`mask_all_element_attributes` — autocapture не видит
 *   ни единого символа с экрана, только структуру кликов.
 * - `session_recording.maskAllInputs`/`maskTextSelector: '*'` — то же для
 *   записи; `blockSelector` вовсе не записывает картинки, видео и iframe
 *   (скриншоты оплат, видео ответов ученика).
 * - `capture_exceptions: false` — свой механизм ошибок уже есть (ADR-0071),
 *   вторая реализация запрещена правилом «одна механика — один компонент».
 * - `disable_external_dependency_loading` — recorder бандлится импортом
 *   (posthogClient.ts), скрипт с чужого домена CSP всё равно бы не пустил.
 * - `before_send: sanitizeEvent` — URL-поля события заменяются шаблоном
 *   маршрута (analyticsPrivacy.ts) до отправки на POSTHOG_HOST.
 */
export function buildPosthogOptions(): Partial<PostHogConfig> {
  return {
    api_host: POSTHOG_HOST,
    // Профиль человека заводится только после identify() (posthogClient.ts)
    // — до входа кабинет PostHog вовсе не грузит, но опция остаётся явной
    // на случай анонимного события до identify в будущем.
    person_profiles: 'identified_only',
    capture_pageview: 'history_change',
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    disable_external_dependency_loading: true,
    disable_surveys: true,
    capture_exceptions: false,
    capture_heatmaps: false,
    capture_dead_clicks: false,
    before_send: sanitizeEvent,
    // Запись не стартует сама при init: первый экран может оказаться
    // маршрутом с секретом в адресе. Включает её syncRecording
    // (posthogClient.ts) после проверки пути.
    disable_session_recording: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      blockSelector: 'img, video, iframe, canvas',
    },
  };
}
