// Контракт `GET /analytics/config` (ADR-0143) — api читает POSTHOG_KEY из env
// и отдаёт наружу через тот же приём, что AuthConfigDto (auth.controller.ts):
// фронт узнаёт, включена ли аналитика, не зная секрета заранее.
// Хост PostHog — облако ЕС (ADR-0143, docs/SECURITY.md): персональные данные
// не должны уезжать под юрисдикцию вне EU. Константа общая для api
// (connectSrc CSP, api/src/security/csp.ts) и web (posthogOptions.ts,
// api_host инициализации) — разъехавшийся адрес не даст CSP пропустить
// собственный же запрос кабинета.
export const POSTHOG_HOST = 'https://eu.i.posthog.com';

/** Пусто — ключ не задан в Railway, PostHog в кабинете не грузится вовсе
 * (useAnalytics.ts). Отдельного поля «включено ли» нет: наличие ключа и
 * есть признак включения. */
export interface AnalyticsConfigDto {
  posthogKey: string | null;
}
