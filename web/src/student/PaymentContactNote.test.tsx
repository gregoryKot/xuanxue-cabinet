// Секция «Оплата» профиля ученика (ADR-0159): контакт бухгалтера из
// /me/payments. Сеть — mockApiByPath, не очередь `…Once` (ADR-0116).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MyPaymentsPageDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { PaymentContactNote } from './PaymentContactNote';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const PATH = '/me/payments';
const PAGE: MyPaymentsPageDto = {
  month: '2026-09',
  rows: [],
  contact: 'Маше @marievyazova',
};

describe('PaymentContactNote — контакт бухгалтера', () => {
  it('контакт из настроек школы — ник ссылкой на чат в Telegram', async () => {
    mockApiByPath({ [PATH]: PAGE });
    render(<PaymentContactNote />);

    const link = await screen.findByRole('link', { name: '@marievyazova' });
    expect(link).toHaveAttribute('href', 'https://t.me/marievyazova');
    expect(link.parentElement).toHaveTextContent(
      'Скриншот перевода присылайте Маше @marievyazova в Telegram.',
    );
    expect(screen.getByRole('heading', { name: 'Оплата' })).toBeInTheDocument();
  });

  it('пока идёт загрузка — скелетон вместо строки, заголовок на месте', () => {
    mockedApiFetch.mockImplementation(() => new Promise(() => undefined));
    render(<PaymentContactNote />);

    expect(screen.getByRole('heading', { name: 'Оплата' })).toBeInTheDocument();
    expect(screen.queryByText(/Скриншот перевода/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ошибка загрузки — баннер с повтором, повтор показывает контакт', async () => {
    mockApiByPath({ [PATH]: new ApiError('Сервер занят.', 500, 'unknown') });
    render(<PaymentContactNote />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер занят.');
    expect(screen.queryByText(/Скриншот перевода/)).not.toBeInTheDocument();

    mockApiByPath({ [PATH]: PAGE });
    await userEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(
      await screen.findByRole('link', { name: '@marievyazova' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
