// Тест границы ошибок (CLAUDE.md, «Обработка ошибок»): при падении рендера
// пользователь видит понятный экран, а не белую страницу. ErrorBoundary
// читает маршрут (аудит L7), поэтому рендерим его внутри Router.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

afterEach(() => {
  vi.restoreAllMocks();
});

function renderBoundary(children: ReactNode, initialEntry = '/a') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ErrorBoundary>{children}</ErrorBoundary>
    </MemoryRouter>,
  );
}

describe('ErrorBoundary', () => {
  it('рендерит детей, если ошибок нет', () => {
    renderBoundary(<p>Всё работает</p>);

    expect(screen.getByText('Всё работает')).toBeInTheDocument();
  });

  it('при падении дочернего рендера показывает заголовок и кнопку обновления', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderBoundary(<Boom />);

    expect(screen.getByText('Что-то сломалось')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeInTheDocument();
  });

  it('логирует упавшую ошибку через console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderBoundary(<Boom />);

    expect(spy).toHaveBeenCalled();
  });

  // Аудит L7: раньше единственный выход с упавшего экрана был перезагрузкой
  // всей вкладки — переход на другой маршрут должен сам восстанавливать его.
  // Ссылка на /b — вне ErrorBoundary (как навигация AppShell в App.tsx), её
  // не затрагивает падение дочернего дерева внутри границы.
  it('переход на другой маршрут восстанавливает экран без перезагрузки', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/a']}>
        <Link to="/b">На экран B</Link>
        <ErrorBoundary>
          <Routes>
            <Route path="/a" element={<Boom />} />
            <Route path="/b" element={<p>Другой экран</p>} />
          </Routes>
        </ErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Что-то сломалось')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'На экран B' }));

    expect(await screen.findByText('Другой экран')).toBeInTheDocument();
    expect(screen.queryByText('Что-то сломалось')).not.toBeInTheDocument();
  });

  it('кнопка «На главную» ведёт на корень', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/a']}>
        <ErrorBoundary>
          <Routes>
            <Route path="/a" element={<Boom />} />
            <Route path="/" element={<p>Корень</p>} />
          </Routes>
        </ErrorBoundary>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'На главную' }));

    expect(await screen.findByText('Корень')).toBeInTheDocument();
  });
});
