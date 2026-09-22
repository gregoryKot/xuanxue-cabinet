// Троттлинг по IP (глобальный ThrottlerGuard бакетирует неверифицированных,
// CLAUDE.md №4) — отдельный, более жёсткий лимит на попытки входа, чем
// общие 120/мин на всё API. Один лимит на Telegram и email — тот же профиль
// злоупотребления (перебор), SECURITY §2. Вынесены из auth.controller.ts
// (файловый храповик, CLAUDE.md «Храповики»): тот файл — у потолка 150
// строк, и EmailCodeController (email-code.controller.ts) делит с
// AuthController один и тот же лимит.
export const TELEGRAM_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
export const EMAIL_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
