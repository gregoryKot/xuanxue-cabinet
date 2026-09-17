// Подпись и тело виджета Telegram Login для e2e (SECURITY §2, telegram-login.ts) —
// общий кусок auth-telegram.e2e-spec.ts и auth-telegram-invite.e2e-spec.ts
// (файловый храповик развёл их по разным файлам, CLAUDE.md «Храповики»),
// подписываем тем же алгоритмом, что и сам виджет.
import { createHash, createHmac } from 'crypto';
import { DateTime } from 'luxon';
import { TEST_BOT_TOKEN } from './create-app';

interface TelegramFields {
  id: number;
  first_name: string;
  auth_date: number;
  [extra: string]: unknown;
}

function sign(fields: Record<string, unknown>): string {
  const dataCheckString = Object.entries(fields)
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
  const secretKey = createHash('sha256').update(TEST_BOT_TOKEN).digest();
  return createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

export function telegramLoginBody(
  overrides: Partial<TelegramFields> = {},
): Record<string, unknown> {
  const fields: TelegramFields = {
    id: 12345,
    first_name: 'Мария',
    auth_date: Math.floor(DateTime.utc().toSeconds()),
    ...overrides,
  };
  return { ...fields, hash: sign(fields) };
}

/** Приватный диапазон TEST-NET-3 (RFC 5737) — не реальный трафик, каждому
 * тесту свой адрес, чтобы троттлер (лимит по IP) не смешивал их бакеты.
 * Счётчик модульный — у каждого e2e-файла своя копия модуля (jest изолирует
 * реестр модулей на файл), поэтому файлы не делят один диапазон октетов. */
let lastIpOctet = 0;
export function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}
