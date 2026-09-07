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
  it('показывает объяснение и ссылку на сайт школы, когда publicUrl есть', async () => {
    mockedApiFetch.mockResolvedValue({ publicUrl: 'https://xuanxue.su' });

    render(<StudentScreen />);

    expect(
      screen.getByText('Кабинет для учителя. Расписание школы — на сайте.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('link', { name: 'https://xuanxue.su' }),
    ).toHaveAttribute('href', 'https://xuanxue.su');
  });

  it('без publicUrl ссылки нет, но объяснение остаётся', () => {
    mockedApiFetch.mockResolvedValue({});

    render(<StudentScreen />);

    expect(
      screen.getByText('Кабинет для учителя. Расписание школы — на сайте.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
