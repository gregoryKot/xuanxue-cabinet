// Тест границы ошибок (CLAUDE.md, «Обработка ошибок»): при падении рендера
// пользователь видит понятный экран, а не белую страницу.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('рендерит детей, если ошибок нет', () => {
    render(
      <ErrorBoundary>
        <p>Всё работает</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('Всё работает')).toBeInTheDocument();
  });

  it('при падении дочернего рендера показывает заголовок и кнопку обновления', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Что-то сломалось')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
  });

  it('логирует упавшую ошибку через console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(spy).toHaveBeenCalled();
  });

  // `window.location.reload` в jsdom нельзя заспайить через vi.spyOn
  // (свойство не переопределяется) — подменяем весь объект location, как
  // единственно рабочий способ проверить обработчик кнопки «Обновить».
  it('кнопка «Обновить» вызывает window.location.reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, reload },
      configurable: true,
      writable: true,
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(reload).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
      writable: true,
    });
  });
});
