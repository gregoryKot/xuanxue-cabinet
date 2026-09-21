// Тест строки «сборка обновилась» (ADR-0099). appVersion.ts хранит состояние
// в closure — как и в api/appVersion.test.ts, каждый тест берёт свежий
// модуль через vi.resetModules() + динамический import(), чтобы поднятый в
// одном тесте флаг не долетал до следующего.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AppVersionModule from '../api/appVersion';
import type { NewVersionBanner as NewVersionBannerType } from './NewVersionBanner';

let noteAppVersion: typeof AppVersionModule.noteAppVersion;
let NewVersionBanner: typeof NewVersionBannerType;

beforeEach(async () => {
  vi.resetModules();
  ({ noteAppVersion } = await import('../api/appVersion'));
  ({ NewVersionBanner } = await import('./NewVersionBanner'));
});

describe('NewVersionBanner', () => {
  it('версия не менялась — строки нет', () => {
    const { container } = render(<NewVersionBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('версия сменилась — видна подпись и кнопка, без role="alert"', () => {
    noteAppVersion('sha-a');
    noteAppVersion('sha-b');

    render(<NewVersionBanner />);

    expect(
      screen.getByText('Кабинет обновился — у вас открыта прежняя версия.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить страницу' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // jsdom не даёт заспайить window.location.reload напрямую (свойство не
  // переопределяется) — подменяем весь объект, тот же рецепт, что в
  // components/ErrorBoundary.test.tsx и app/lazyRoute.test.tsx.
  it('клик «Обновить страницу» вызывает window.location.reload', async () => {
    noteAppVersion('sha-a');
    noteAppVersion('sha-b');
    const user = userEvent.setup();
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload },
      configurable: true,
      writable: true,
    });

    render(<NewVersionBanner />);
    await user.click(screen.getByRole('button', { name: 'Обновить страницу' }));

    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });
});
