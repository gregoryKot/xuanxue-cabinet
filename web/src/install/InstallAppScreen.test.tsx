// Экран «Приложение на телефоне» (docs/PWA.md) — своя ветка на platform ×
// standalone, сети не трогает (детект целиком на navigator/matchMedia), тот
// же приём подмены глобалей, что у pwa/installEnvironment.test.ts.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureInstallPrompt } from '../pwa/installPromptCapture';
import InstallAppScreen from './InstallAppScreen';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/124.0 Mobile';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function stubEnvironment(userAgent: string, standalone: boolean) {
  vi.stubGlobal('navigator', { userAgent });
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: standalone }));
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <InstallAppScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstallAppScreen', () => {
  it('standalone — только «уже стоит» и ссылка на профиль, без шагов', () => {
    stubEnvironment(IPHONE_UA, true);

    renderScreen();

    expect(screen.getByText('Кабинет уже стоит на этом телефоне.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.queryByText('iPhone')).not.toBeInTheDocument();
  });

  it('iPhone, не standalone — шаги iPhone, повторный вход, подсказка про уведомления', () => {
    stubEnvironment(IPHONE_UA, false);

    renderScreen();

    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBe(4);
    const relogin = Array.from(document.querySelectorAll('p')).find((p) =>
      p.textContent?.includes('на iPhone приложение не видит вход'),
    );
    expect(relogin).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Открыть профиль' })).toHaveAttribute(
      'href',
      '/profile',
    );
    expect(screen.queryByText('Android')).not.toBeInTheDocument();
  });

  it('Android без beforeinstallprompt — только шаги руками, без кнопки', () => {
    stubEnvironment(ANDROID_UA, false);

    renderScreen();

    expect(screen.getByText('Android')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Установить приложение' }),
    ).not.toBeInTheDocument();
    // Кнопки нет вовсе (нет события `beforeinstallprompt`) — заголовок
    // «Если кнопки нет» не рисуется, шаги руками идут сразу как основная
    // инструкция.
    expect(screen.queryByText('Если кнопки нет')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBe(4);
    expect(screen.queryByText('iPhone')).not.toBeInTheDocument();
  });

  it('десктоп — адрес хоста и обе инструкции', () => {
    stubEnvironment(DESKTOP_UA, false);
    vi.stubGlobal('location', { ...window.location, host: 'staging.xuanxue.su' });

    renderScreen();

    expect(screen.getByText(/staging\.xuanxue\.su/)).toBeInTheDocument();
    expect(screen.getByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText('Android')).toBeInTheDocument();
  });

  // Последний тест файла: promptInstall() сбрасывает пойманное событие сам
  // (pwa/useInstallPrompt.ts), поэтому модульное состояние
  // installPromptCapture.ts не утекает в тесты выше по файлу.
  it('Android с пойманным beforeinstallprompt — кнопка «Установить приложение» зовёт его', async () => {
    stubEnvironment(ANDROID_UA, false);
    captureInstallPrompt();
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    event.prompt = vi.fn().mockResolvedValue(undefined);
    event.userChoice = Promise.resolve({ outcome: 'accepted' as const });
    window.dispatchEvent(event);
    const user = userEvent.setup();

    renderScreen();
    const button = screen.getByRole('button', { name: 'Установить приложение' });
    await user.click(button);

    expect(event.prompt).toHaveBeenCalledTimes(1);
  });
});
