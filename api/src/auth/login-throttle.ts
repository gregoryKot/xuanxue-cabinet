// Троттлинг по IP (глобальный ThrottlerGuard бакетирует неверифицированных,
// CLAUDE.md №4) — отдельный, более жёсткий лимит на попытки входа, чем
// общие 120/мин на всё API. Один лимит на Telegram и email — тот же профиль
// злоупотребления (перебор), SECURITY §2. Вынесены из auth.controller.ts
// (файловый храповик, CLAUDE.md «Храповики»): тот файл — у потолка 150
// строк, и EmailCodeController (email-code.controller.ts) делит с
// AuthController один и тот же лимит.
// Telegram и Google — вход по подписи (HMAC виджета, код OAuth): перебирать
// нечего, лимит здесь — от потопа, не от подбора. 10/мин на IP (до аудита
// 2026-10-01) запирал 11-го ученика класса за одним Wi-Fi на минуту перед
// самым экзаменом. Email — код из письма, его подбирают: лимит прежний.
export const TELEGRAM_LOGIN_THROTTLE = { default: { limit: 30, ttl: 60_000 } };
export const EMAIL_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
// Вход через Google (ADR-0145) — тот же профиль, обе ветки (start и сам вход).
export const GOOGLE_LOGIN_THROTTLE = { default: { limit: 30, ttl: 60_000 } };
// Нативный Daychi (ADR-0181): bearer проверяется в базе, до трекера он не
// верифицирован, поэтому бакет — по IP (правило CLAUDE.md №4). Запросы редкие
// (чтение при запуске, продление раз в неделю), лимит — от перебора токенов.
export const NATIVE_AUTH_THROTTLE = { default: { limit: 60, ttl: 60_000 } };
