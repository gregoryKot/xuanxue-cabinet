// Экран теперь сам выходит из кабинета (кнопка переехала из шапки AppShell),
// поэтому ему нужны и роутер, и AuthProvider — как в настоящем дереве.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from '../auth/AuthProvider';
import { StudentScreen } from './StudentScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderStudent(config: Record<string, unknown>) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/config') return Promise.resolve(config);
    if (path === '/auth/me')
      return Promise.resolve({
        id: 'u2',
        name: 'Ученик',
        roles: ['student'],
        tz: 'Asia/Jerusalem',
      });
    if (path === '/auth/logout') return Promise.resolve(undefined);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<StudentScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('StudentScreen', () => {
  it('учитель заполнил адрес сайта школы — ссылка на сайт', async () => {
    renderStudent({ schoolSiteUrl: 'https://xuanxue.su' });

    expect(screen.getByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'https://xuanxue.su' }),
    ).toHaveAttribute('href', 'https://xuanxue.su');
    expect(screen.queryByText('Расписание вам пришлёт учитель.')).not.toBeInTheDocument();
  });

  it('без адреса сайта школы — без ссылки, текст «Расписание вам пришлёт учитель»', () => {
    renderStudent({});

    expect(screen.getByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(screen.getByText('Расписание вам пришлёт учитель.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  // До «Настроек» ученик не доходит — навигации у него нет, поэтому выход
  // обязан быть здесь.
  it('«Выйти» — POST /auth/logout и переход на вход', async () => {
    const user = userEvent.setup();
    renderStudent({});

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });
});
