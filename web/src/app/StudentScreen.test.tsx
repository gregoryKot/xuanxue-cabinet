// «Выйти» больше не рисует сам экран — кнопка переехала в подвал AppShell,
// общий с учителем (её механику проверяют AppShell.test.tsx и
// LogoutButton.test.tsx). Экран сам читает только конфиг входа
// (useAuthConfig) — ни роутер, ни AuthProvider ему больше не нужны.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { StudentScreen } from './StudentScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderStudent(config: Record<string, unknown>) {
  mockedApiFetch.mockResolvedValue(config);
  return render(<StudentScreen />);
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

  it('без адреса сайта школы — без ссылки, текст «Расписание вам пришлёт учитель»', async () => {
    renderStudent({});

    expect(screen.getByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(
      await screen.findByText('Расписание вам пришлёт учитель.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
