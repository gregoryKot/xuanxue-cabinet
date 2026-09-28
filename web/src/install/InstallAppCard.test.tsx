// Карточка установки в оболочке (docs/PWA.md) — детект платформы через
// installEnvironment.ts (сама протестирована отдельно), здесь — какая кнопка
// видна и что делает «Не сейчас». Приём подмены navigator/matchMedia — как у
// pwa/installEnvironment.test.ts; событие beforeinstallprompt — как у
// pwa/useInstallPrompt.test.ts (модульное состояние, свежий импорт на тест).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallAppCard as InstallAppCardType } from './InstallAppCard';
import type * as CaptureModule from '../pwa/installPromptCapture';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function stubEnvironment(userAgent: string, standalone = false) {
  vi.stubGlobal('navigator', { userAgent });
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: standalone }));
}

function dispatchBeforeInstallPrompt() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);
}

let InstallAppCard: typeof InstallAppCardType;
let captureInstallPrompt: typeof CaptureModule.captureInstallPrompt;

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  ({ captureInstallPrompt } = await import('../pwa/installPromptCapture'));
  ({ InstallAppCard } = await import('./InstallAppCard'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderCard(initialPath = '/tasks') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <InstallAppCard />
    </MemoryRouter>,
  );
}

describe('InstallAppCard', () => {
  it('десктоп — карточки нет, ставить некуда', () => {
    stubEnvironment(DESKTOP_UA);
    captureInstallPrompt();

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });

  it('iPhone, standalone — карточки нет, кабинет уже стоит', () => {
    stubEnvironment(IPHONE_UA, true);
    captureInstallPrompt();

    const { container } = renderCard();

    expect(container).toBeEmptyDOMElement();
  });

  it('iPhone, не standalone — карточка со ссылкой «Как поставить»', () => {
    stubEnvironment(IPHONE_UA, false);
    captureInstallPrompt();

    renderCard();

    expect(screen.getByText('Поставьте кабинет на телефон')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Как поставить' })).toHaveAttribute(
      'href',
      '/install',
    );
    expect(screen.queryByRole('button', { name: 'Установить' })).not.toBeInTheDocument();
  });

  it('на «/install» карточки нет — она же там, дублировать некуда', () => {
    stubEnvironment(IPHONE_UA, false);
    captureInstallPrompt();

    const { container } = renderCard('/install');

    expect(container).toBeEmptyDOMElement();
  });

  it('Android с пойманным beforeinstallprompt — кнопка «Установить», без ссылки', async () => {
    stubEnvironment(ANDROID_UA, false);
    captureInstallPrompt();
    dispatchBeforeInstallPrompt();

    renderCard();

    const button = screen.getByRole('button', { name: 'Установить' });
    expect(button).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Как поставить' })).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(button);

    expect(screen.queryByRole('button', { name: 'Установить' })).not.toBeInTheDocument();
  });

  it('«Не сейчас» скрывает карточку и запоминает выбор', async () => {
    stubEnvironment(IPHONE_UA, false);
    captureInstallPrompt();
    const user = userEvent.setup();

    const { container } = renderCard();
    await user.click(screen.getByRole('button', { name: 'Не сейчас' }));

    expect(container).toBeEmptyDOMElement();
    expect(localStorage.getItem('xuanxue.installCard.dismissed')).toBe('1');
  });
});
