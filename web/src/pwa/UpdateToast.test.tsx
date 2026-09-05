// Тест тоста обновления (ADR-0006): мокаем сам хук useServiceWorkerUpdate —
// его собственное поведение проверяет useServiceWorkerUpdate.test.ts,
// здесь важно только «показываем ли тост и куда ведут кнопки».
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UpdateToast } from './UpdateToast';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';

vi.mock('./useServiceWorkerUpdate', () => ({ useServiceWorkerUpdate: vi.fn() }));

const mockedHook = vi.mocked(useServiceWorkerUpdate);

describe('UpdateToast', () => {
  it('ничего не рендерит, пока needRefresh=false', () => {
    mockedHook.mockReturnValue({
      needRefresh: false,
      offlineReady: false,
      update: vi.fn(),
      dismiss: vi.fn(),
    });

    const { container } = render(<UpdateToast />);

    expect(container).toBeEmptyDOMElement();
  });

  it('при needRefresh=true показывает текст и обе кнопки доступным статус-блоком', () => {
    mockedHook.mockReturnValue({
      needRefresh: true,
      offlineReady: false,
      update: vi.fn(),
      dismiss: vi.fn(),
    });

    render(<UpdateToast />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Появилась новая версия');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Позже' })).toBeInTheDocument();
  });

  it('клик «Обновить» вызывает update ровно один раз', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    mockedHook.mockReturnValue({
      needRefresh: true,
      offlineReady: false,
      update,
      dismiss: vi.fn(),
    });
    const user = userEvent.setup();

    render(<UpdateToast />);
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('клик «Позже» вызывает dismiss ровно один раз', async () => {
    const dismiss = vi.fn();
    mockedHook.mockReturnValue({
      needRefresh: true,
      offlineReady: false,
      update: vi.fn(),
      dismiss,
    });
    const user = userEvent.setup();

    render(<UpdateToast />);
    await user.click(screen.getByRole('button', { name: 'Позже' }));

    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
