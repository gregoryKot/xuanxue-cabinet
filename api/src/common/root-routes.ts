// Маршруты Nest от корня сайта, без префикса `/api` (ADR-0181): профиль Workshop
// считает путь входа Daychi от issuer. Один список на три потребителя —
// исключение из `setGlobalPrefix` (app.setup.ts), из раздачи web/dist
// (static-cache-control.ts: иначе SPA отдаст на этот адрес index.html) и гейт
// scripts/check-ownership-e2e.mjs, который читает этот файл как текст. Поэтому
// элементы — только строковые литералы, без констант и сборки строк.
export const ROOT_ROUTES = ['auth/native/authorize'] as const;
