// Ролик установки: свой файл на браузер, звук по кнопке, при «меньше
// движения» — без автозапуска. Подмена глобалей — тот же приём, что у
// InstallAppScreen.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallVideo } from './InstallVideo';

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: reduce }));
}

function video(): HTMLVideoElement {
  return screen.getByLabelText<HTMLVideoElement>(
    'Видео: шаги установки на экране телефона',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InstallVideo', () => {
  it.each([
    ['ios-safari', 'Safari на iPhone'],
    ['ios-chrome', 'Chrome на iPhone'],
    ['android-chrome', 'Chrome на Android'],
    ['android-yandex', 'Яндекс Браузера на Android'],
  ] as const)('%s — свой ролик и название браузера в подписи', (browser, name) => {
    stubReducedMotion(false);

    render(<InstallVideo browser={browser} />);

    expect(video().src).toContain(`install-${browser}`);
    expect(screen.getByText(name)).toBeInTheDocument();
  });

  it('идёт сам, по кругу и без звука; кнопка включает и выключает звук', async () => {
    stubReducedMotion(false);
    render(<InstallVideo browser="ios-safari" />);

    expect(video().autoplay).toBe(true);
    expect(video().loop).toBe(true);
    expect(video().controls).toBe(false);
    expect(video().muted).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Включить звук' }));
    expect(video().muted).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: 'Выключить звук' }));
    expect(video().muted).toBe(true);
  });

  it('«меньше движения» — стоит, запуск кнопкой плеера', () => {
    stubReducedMotion(true);

    render(<InstallVideo browser="android-chrome" />);

    expect(video().autoplay).toBe(false);
    expect(video().controls).toBe(true);
  });
});
