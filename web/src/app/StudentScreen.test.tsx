import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { StudentScreen } from './StudentScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('StudentScreen', () => {
  it('учитель заполнил адрес сайта школы — ссылка на сайт', async () => {
    mockedApiFetch.mockResolvedValue({ schoolSiteUrl: 'https://xuanxue.su' });

    render(<StudentScreen />);

    expect(screen.getByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'https://xuanxue.su' }),
    ).toHaveAttribute('href', 'https://xuanxue.su');
    expect(screen.queryByText('Расписание вам пришлёт учитель.')).not.toBeInTheDocument();
  });

  it('без адреса сайта школы — без ссылки, текст «Расписание вам пришлёт учитель»', () => {
    mockedApiFetch.mockResolvedValue({});

    render(<StudentScreen />);

    expect(screen.getByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(screen.getByText('Расписание вам пришлёт учитель.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
