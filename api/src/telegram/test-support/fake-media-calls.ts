// Запись вызовов Bot API с вложением для createFakeTelegrafFactory — вынесено
// из telegraf-factory.ts (файл-лимит CLAUDE.md): видео экзамена по file_id
// (ADR-0095), снимок перевода бухгалтеру байтами (ADR-0156) и копия сообщения
// ученика (снимок из бота). Сеть не трогаем: вызов лишь записывается, а
// «сбой» включается опцией фабрики.
interface SendVideoCall {
  chatId: string;
  video: string;
}

interface SendPhotoCall {
  chatId: string;
  /** Имя файла из `{ source, filename }` — так уходит снимок, загруженный в
   * кабинете; у фото по file_id (строка) имени нет. */
  filename?: string;
  /** Уехали байты (`source: Buffer`), а не file_id. */
  hasBytes: boolean;
}

interface CopyMessageCall {
  chatId: string;
  fromChatId: string;
  messageId: number;
}

export interface MediaCalls {
  sendVideoCalls: SendVideoCall[];
  sendPhotoCalls: SendPhotoCall[];
  copyMessageCalls: CopyMessageCall[];
}

export interface MediaFailures {
  failSendVideo?: boolean;
  failSendPhoto?: boolean;
}

type Payload = Record<string, unknown> | undefined;

export function createMediaCalls(): MediaCalls {
  return { sendVideoCalls: [], sendPhotoCalls: [], copyMessageCalls: [] };
}

function chatIdOf(payload: Payload, key = 'chat_id'): string {
  return String((payload?.[key] as string | number | undefined) ?? '');
}

/** `undefined` — метод не про вложения, его разбирает сама фабрика. Флаги
 * читаются в момент вызова: e2e включает сбой на лету (один AppModule на файл). */
export function recordMediaCall(
  method: string,
  payload: Payload,
  calls: MediaCalls,
  failures: MediaFailures,
): Promise<true> | undefined {
  const fail = new Error('сеть недоступна');
  if (method === 'sendVideo') {
    if (failures.failSendVideo) return Promise.reject(fail);
    calls.sendVideoCalls.push({
      chatId: chatIdOf(payload),
      video: (payload?.video as string | undefined) ?? '',
    });
    return Promise.resolve(true);
  }
  if (method === 'sendPhoto') {
    if (failures.failSendPhoto) return Promise.reject(fail);
    const photo = payload?.photo as { source?: unknown; filename?: string } | string;
    const isFile = typeof photo === 'object' && photo !== null;
    calls.sendPhotoCalls.push({
      chatId: chatIdOf(payload),
      ...(isFile && photo.filename !== undefined ? { filename: photo.filename } : {}),
      hasBytes: isFile && Buffer.isBuffer(photo.source),
    });
    return Promise.resolve(true);
  }
  if (method === 'copyMessage') {
    calls.copyMessageCalls.push({
      chatId: chatIdOf(payload),
      fromChatId: chatIdOf(payload, 'from_chat_id'),
      messageId: (payload?.message_id as number | undefined) ?? 0,
    });
    return Promise.resolve(true);
  }
  return undefined;
}
