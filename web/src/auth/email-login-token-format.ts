// Формат токена входа по email — 64 hex-символа (`randomBytes(32).toString('hex')`,
// api/src/auth/email-login-token.service.ts). Копия регулярки, не импорт из
// api: слои (CLAUDE.md «Структура») — web не знает об api, а сам паттерн не
// доменный контракт, а деталь формата URL, проверка здесь — только чтобы не
// звать сервер с заведомо обрезанной ссылкой (SECURITY §2 всё равно перепроверяет).
export const EMAIL_LOGIN_TOKEN_RE = /^[0-9a-f]{64}$/;
