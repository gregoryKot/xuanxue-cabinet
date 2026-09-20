// Клик зовёт API и уводит в Telegram, сбой показывается рядом с кнопкой,
// возврат на вкладку после начатой связки перечитывает /auth/me
// (read-after-write, CLAUDE.md) — проверка visibilitychange, унаследованная
// от теста удалённого экрана ожидания (ADR-0036).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { TelegramLinkButton } from './TelegramLinkButton';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
});

const LINK_CODE_PATH = '/auth/telegram/link-code';
const LINK_URL = 'https://t.me/xuanxue_bot?start=link_' + 'a'.repeat(32);

function renderButton(explanation?: string, onBeforeLink?: () => Promise<void>) {
  return render(
    <AuthProvider>
      <TelegramLinkButton explanation={explanation} onBeforeLink={onBeforeLink} />
    </AuthProvider>,
  );
}

describe('TelegramLinkButton — начальный вид', () => {
  it('без объяснения — только кнопка, без текста над ней', async () => {
    mockApiByPath({ '/auth/me': new Error('нет сессии') });
    renderButton();

    expect(
      await screen.findByRole('button', { name: 'Связать Telegram' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('с объяснением — текст показан над кнопкой', async () => {
    mockApiByPath({ '/auth/me': new Error('нет сессии') });
    renderButton('Видео принимает бот в Telegram.');

    expect(
      await screen.findByText('Видео принимает бот в Telegram.'),
    ).toBeInTheDocument();
  });
});

describe('TelegramLinkButton — клик', () => {
  it('зовёт /auth/telegram/link-code и уводит текущую вкладку на telegramUrl', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', {
      origin: 'https://xuanxue.su',
      href: 'https://xuanxue.su/notifications',
      assign,
    });
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': new Error('нет сессии'),
      [LINK_CODE_PATH]: { telegramUrl: LINK_URL },
    });
    renderButton();

    await user.click(await screen.findByRole('button', { name: 'Связать Telegram' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith(LINK_URL));
  });

  it('сбой сервера — текст ошибки role="alert" рядом с кнопкой', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': new Error('нет сессии'),
      [LINK_CODE_PATH]: new Error('boom'),
    });
    renderButton();

    await user.click(await screen.findByRole('button', { name: 'Связать Telegram' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});

describe('TelegramLinkButton — onBeforeLink (ADR-0059)', () => {
  it('дожидается onBeforeLink до link() — в Telegram уходит только после того, как он выполнился', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', {
      origin: 'https://xuanxue.su',
      href: 'https://xuanxue.su/welcome',
      assign,
    });
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': new Error('нет сессии'),
      [LINK_CODE_PATH]: { telegramUrl: LINK_URL },
    });
    let resolveBeforeLink: () => void = () => {};
    const onBeforeLink = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveBeforeLink = resolve;
        }),
    );
    renderButton(undefined, onBeforeLink);

    await user.click(await screen.findByRole('button', { name: 'Связать Telegram' }));

    // onBeforeLink уже вызван, но пока не выполнился — link() ждёт его и в
    // сеть за кодом связки ещё не ходил.
    expect(onBeforeLink).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).not.toHaveBeenCalledWith(LINK_CODE_PATH, expect.anything());

    resolveBeforeLink();

    await waitFor(() => expect(assign).toHaveBeenCalledWith(LINK_URL));
  });
});

describe('TelegramLinkButton — возврат из Telegram (read-after-write)', () => {
  it('связку не начинали — возврат на вкладку не перечитывает /auth/me', async () => {
    mockApiByPath({ '/auth/me': new Error('нет сессии') });
    renderButton();
    await screen.findByRole('button', { name: 'Связать Telegram' });
    mockedApiFetch.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('связку начали, вкладка скрылась и снова стала видимой — /auth/me перечитан', async () => {
    vi.stubGlobal('location', {
      origin: 'https://xuanxue.su',
      href: 'https://xuanxue.su/notifications',
      assign: vi.fn(),
    });
    const user = userEvent.setup();
    mockApiByPath({
      '/auth/me': new Error('нет сессии'),
      [LINK_CODE_PATH]: { telegramUrl: LINK_URL },
    });
    renderButton();
    await user.click(await screen.findByRole('button', { name: 'Связать Telegram' }));
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(LINK_CODE_PATH, expect.anything()),
    );
    mockedApiFetch.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me'));
  });
});

// Проп добавлен для «Уведомлений» (ADR-0065): терракота там уже занята
// точками непрочитанного, кнопка связки идёт вторичным силуэтом.
describe('TelegramLinkButton — variant', () => {
  it('variant="secondary" доходит до кнопки', async () => {
    mockApiByPath({ '/auth/me': new Error('нет сессии') });
    render(
      <AuthProvider>
        <TelegramLinkButton variant="secondary" />
      </AuthProvider>,
    );

    expect(await screen.findByRole('button', { name: 'Связать Telegram' })).toHaveStyle({
      background: 'transparent',
    });
  });
});
