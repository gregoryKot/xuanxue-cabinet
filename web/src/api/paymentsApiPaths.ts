// Пути экрана «Оплаты» (слой 2.3) — отдельным файлом, не apiPaths.ts: тот уже
// стоит на потолке храповика размера, тот же приём, что у tagsApiPaths.ts.
// Сами запросы идут через карту маршрутов (apiRoute, shared/src/api-routes.ts);
// здесь — только то, что нужно строкой: ключ предзагрузки и адрес картинки.
import { PAYMENT_LIMITS } from '@xuanxue/shared';
import { apiRoutePath } from './apiRoute';

/** Список оплат месяца целиком (не первая страница: активных учеников школы
 * сотни, а не тысячи). `null` — месяц не выбран: сервер берёт текущий в поясе
 * школы и возвращает его в `page.month`, клиент часов школы не считает.
 * Запрос и предзагрузка (routeModules.ts) собирают путь одной функцией —
 * иначе разошёлся бы ключ prefetchCache.ts. */
export function paymentsQuery(month: string | null): {
  month?: string;
  limit: number;
} {
  const limit = PAYMENT_LIMITS.listLimitMax;
  return month === null ? { limit } : { month, limit };
}

export function paymentsListPath(month: string | null): string {
  return apiRoutePath('GET /payments', { query: paymentsQuery(month) });
}

/** Адрес снимка перевода для `<img src>` (ADR-0149) — не запрос через
 * apiFetch: картинку грузит сам браузер с cookie-сессией, тот же приём, что у
 * examImageSrc (apiPaths.ts). */
export function paymentScreenshotSrc(userId: string, month: string): string {
  return `/api/payments/${userId}/${month}/screenshot`;
}

/** Оплата ученика за месяц — карточка «Доски» и «Профиль» (ADR-0173). Строка
 * нужна предзагрузке первого экрана: ключ prefetchCache.ts — тот же путь. */
export const MY_PAYMENTS_PATH = apiRoutePath('GET /me/payments');
