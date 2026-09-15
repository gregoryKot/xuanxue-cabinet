// Адрес перехода на Telegram собираем сами (telegramAuthRedirect.ts) — значит
// проверяем ровно то, от чего зависит возврат: bot_id, origin, доступ на
// запись и return_to. Ошибка в любом из них выглядит как «вход не работает».
import { afterEach, describe, expect, it, vi } from 'vitest';
import { redirectToTelegramAuth, telegramAuthUrl } from './telegramAuthRedirect';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('telegramAuthUrl', () => {
  it('несёт bot_id, origin, доступ на запись и адрес возврата', () => {
    const url = new URL(
      telegramAuthUrl(123456, 'https://xuanxue.su', 'https://xuanxue.su/login'),
    );

    expect(url.origin + url.pathname).toBe('https://oauth.telegram.org/auth');
    expect(url.searchParams.get('bot_id')).toBe('123456');
    expect(url.searchParams.get('origin')).toBe('https://xuanxue.su');
    expect(url.searchParams.get('request_access')).toBe('write');
    expect(url.searchParams.get('return_to')).toBe('https://xuanxue.su/login');
  });

  // Возврат идёт на тот же адрес, с которого ушли: если бы return_to не
  // кодировался, его путь потерялся бы в разборе адреса на стороне Telegram.
  it('кодирует адрес возврата с путём и параметрами', () => {
    const returnTo = 'https://xuanxue.su/login?from=%D0%B1%D0%BE%D1%82';
    const url = new URL(telegramAuthUrl(1, 'https://xuanxue.su', returnTo));

    expect(url.searchParams.get('return_to')).toBe(returnTo);
  });
});

describe('redirectToTelegramAuth', () => {
  // location в jsdom не переопределяется по свойству (assign не
  // configurable) — подменяем объект целиком, как и в остальных тестах web.
  it('уводит текущую вкладку, а не открывает новую', () => {
    const assign = vi.fn();
    vi.stubGlobal('location', {
      origin: 'https://xuanxue.su',
      href: 'https://xuanxue.su/login',
      assign,
    });

    redirectToTelegramAuth(123456);

    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0]?.[0] as string);
    expect(url.searchParams.get('bot_id')).toBe('123456');
    expect(url.searchParams.get('origin')).toBe('https://xuanxue.su');
    expect(url.searchParams.get('return_to')).toBe('https://xuanxue.su/login');
  });
});
