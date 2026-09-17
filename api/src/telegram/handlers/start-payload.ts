// Разбор payload'а `/start` — вынесено из StartHandler целиком (файл-лимит
// 150 строк, тот же приём, что у start-welcome.ts и join-invite-deep-link.ts).
// Три вида ссылки: `exam_<attemptId>[_<itemId>]` (ADR-0023, «Отправить
// видео»; вторая форма — ADR-0037, адресует конкретный вопрос, старая без
// вопроса продолжает работать — такие ссылки могли уже уйти ученикам),
// `join_<code>` (ADR-0030 «Бот», ссылка-приглашение школы) и
// `link_<code>` (ADR-0034, «Связать Telegram» — привязка к аккаунту,
// заведённому по почте). Порядок и проверки — прежние: ObjectId для попытки
// и вопроса, формат кода — общим regex с соответствующим DTO.
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import {
  INVITE_CODE_RE,
  INVITE_TELEGRAM_START_PREFIX,
  TELEGRAM_LINK_CODE_RE,
  TELEGRAM_LINK_START_PREFIX,
} from '@xuanxue/shared';

const EXAM_MEDIA_PAYLOAD_PATTERN = /^exam_([0-9a-fA-F]{24})(?:_([0-9a-fA-F]{24}))?$/;

export type StartPayload =
  | { kind: 'examMedia'; attemptId: string; itemId?: string }
  | { kind: 'invite'; code: string }
  | { kind: 'telegramLink'; code: string };

/** Текст после `/start ` — Telegraf типизирует `ctx.startPayload` только
 * внутри своего `bot.start()` (composer.d.ts, `StartContextExtn`), а не на
 * общем `Context`, поэтому читаем сырой текст сообщения тем же приёмом, что
 * и остальные хендлеры (recording-source.ts) — без кастов и без потери типа. */
function startPayload(ctx: Context): string | undefined {
  const message = ctx.message;
  if (!message || !('text' in message)) return undefined;
  const [, payload] = message.text.split(' ');
  return payload;
}

/** `null` — не deep link на видео экзамена (обычный /start, чужая команда).
 * `itemId` есть только у новой формы (ADR-0037) — старая остаётся без него. */
function examMediaFromPayload(
  payload: string | undefined,
): { attemptId: string; itemId?: string } | null {
  const match = payload?.match(EXAM_MEDIA_PAYLOAD_PATTERN);
  const attemptId = match?.[1];
  if (!attemptId || !Types.ObjectId.isValid(attemptId)) return null;
  const itemId = match[2];
  return itemId ? { attemptId, itemId } : { attemptId };
}

/** `null` — не ссылка-приглашение (обычный /start, чужая команда, битый
 * код) — формат сверяем тем же `INVITE_CODE_RE`, что и DTO `/auth/join`. */
function inviteCodeFromPayload(payload: string | undefined): string | null {
  if (!payload?.startsWith(INVITE_TELEGRAM_START_PREFIX)) return null;
  const code = payload.slice(INVITE_TELEGRAM_START_PREFIX.length);
  return INVITE_CODE_RE.test(code) ? code : null;
}

/** `null` — не ссылка связки Telegram (обычный /start, чужая команда, битый
 * код) — формат сверяем тем же `TELEGRAM_LINK_CODE_RE`, что и код, который
 * выпускает кабинет (TelegramLinkCodeService). */
function telegramLinkCodeFromPayload(payload: string | undefined): string | null {
  if (!payload?.startsWith(TELEGRAM_LINK_START_PREFIX)) return null;
  const code = payload.slice(TELEGRAM_LINK_START_PREFIX.length);
  return TELEGRAM_LINK_CODE_RE.test(code) ? code : null;
}

/** `null` — обычный /start без payload либо мусор (чужая ссылка, битый код). */
export function parseStartPayload(ctx: Context): StartPayload | null {
  const payload = startPayload(ctx);

  const examMedia = examMediaFromPayload(payload);
  if (examMedia) return { kind: 'examMedia', ...examMedia };

  const inviteCode = inviteCodeFromPayload(payload);
  if (inviteCode) return { kind: 'invite', code: inviteCode };

  const linkCode = telegramLinkCodeFromPayload(payload);
  if (linkCode) return { kind: 'telegramLink', code: linkCode };

  return null;
}
