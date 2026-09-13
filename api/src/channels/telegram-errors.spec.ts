// Чистая логика без сети и DI (CLAUDE.md «Тесты»).
import {
  CHAT_NOT_FOUND_MESSAGE,
  NOT_ADMIN_MESSAGE,
  TEMPORARY_MESSAGE,
  isRetryableTelegramCode,
  isTelegramApiError,
  messageForTelegramError,
  retryAfterSecFrom,
} from './telegram-errors';

describe('messageForTelegramError', () => {
  it('400 «message is too long» — текст про лимит поста', () => {
    expect(messageForTelegramError(400, 'Bad Request: message is too long')).toBe(
      'Пост длиннее лимита Telegram (4096 знаков). Сократите шаблон или тему.',
    );
  });

  it('400 «wrong file identifier» — текст про file_id', () => {
    expect(
      messageForTelegramError(
        400,
        'Bad Request: wrong file identifier/HTTP URL specified',
      ),
    ).toBe('Telegram не нашёл видео по file_id — пришлите запись боту заново.');
  });

  it('400 «caption is too long» — текст про подпись', () => {
    expect(messageForTelegramError(400, 'Bad Request: message caption is too long')).toBe(
      'Подпись к видео длиннее 1024 знаков. Сократите текст занятия.',
    );
  });

  it('400 «chat not found» — чат не найден', () => {
    expect(messageForTelegramError(400, 'Bad Request: chat not found')).toBe(
      CHAT_NOT_FOUND_MESSAGE,
    );
  });

  it('400 с неизвестным description — текст Telegram как есть', () => {
    expect(messageForTelegramError(400, 'Bad Request: something unexpected')).toBe(
      'Telegram отклонил сообщение: Bad Request: something unexpected',
    );
  });

  it('403 — бот не админ/удалён из чата, независимо от description', () => {
    expect(messageForTelegramError(403, 'Forbidden: bot is not a member')).toBe(
      NOT_ADMIN_MESSAGE,
    );
  });

  it('403 «bot was kicked» — тот же текст про админа', () => {
    expect(
      messageForTelegramError(403, 'Forbidden: bot was kicked from the group chat'),
    ).toBe(NOT_ADMIN_MESSAGE);
  });

  it('403 «bot was blocked by the user» — тот же текст про админа', () => {
    expect(messageForTelegramError(403, 'Forbidden: bot was blocked by the user')).toBe(
      NOT_ADMIN_MESSAGE,
    );
  });

  it('429 — временно недоступен', () => {
    expect(messageForTelegramError(429, 'Too Many Requests: retry after 30')).toBe(
      TEMPORARY_MESSAGE,
    );
  });

  it('5xx — временно недоступен', () => {
    expect(messageForTelegramError(502, 'Bad Gateway')).toBe(TEMPORARY_MESSAGE);
  });

  it('неизвестный код — текст с кодом', () => {
    expect(messageForTelegramError(401, 'Unauthorized')).toBe(
      'Telegram отклонил сообщение (код 401). Проверьте настройки бота.',
    );
  });
});

describe('isRetryableTelegramCode', () => {
  it('429 и 5xx — retryable', () => {
    expect(isRetryableTelegramCode(429)).toBe(true);
    expect(isRetryableTelegramCode(500)).toBe(true);
    expect(isRetryableTelegramCode(503)).toBe(true);
  });

  it('400 и 403 — не retryable', () => {
    expect(isRetryableTelegramCode(400)).toBe(false);
    expect(isRetryableTelegramCode(403)).toBe(false);
  });
});

describe('retryAfterSecFrom', () => {
  it('429 с parameters.retry_after — отдаёт секунды', () => {
    expect(retryAfterSecFrom({ code: 429, parameters: { retry_after: 30 } })).toBe(30);
  });

  it('429 без parameters — undefined', () => {
    expect(retryAfterSecFrom({ code: 429 })).toBeUndefined();
  });

  it('код не 429 — undefined, даже если retry_after пришёл', () => {
    expect(
      retryAfterSecFrom({ code: 400, parameters: { retry_after: 30 } }),
    ).toBeUndefined();
  });
});

describe('isTelegramApiError', () => {
  it('объект с числовым code — да', () => {
    expect(isTelegramApiError({ code: 400 })).toBe(true);
  });

  it('без code — нет', () => {
    expect(isTelegramApiError(new Error('boom'))).toBe(false);
    expect(isTelegramApiError(null)).toBe(false);
    expect(isTelegramApiError('строка')).toBe(false);
  });
});
