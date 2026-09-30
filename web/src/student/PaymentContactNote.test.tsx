// Секция «Оплата» профиля ученика (ADR-0159): контакт бухгалтера из
// /me/payments. Сеть — mockApiByPath, не очередь `…Once` (ADR-0116).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MyPaymentReminderDto, MyPaymentsPageDto } from '@xuanxue/shared';
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

const DAY_PATH = '/me/payments/reminder-day';
const SCHOOL_REMINDER: MyPaymentReminderDto = {
  dayOfMonth: 5,
  isOwnDay: false,
  schoolDayOfMonth: 5,
  time: '10:00',
};
const PAGE_WITH_REMINDER: MyPaymentsPageDto = { ...PAGE, reminder: SCHOOL_REMINDER };
const OWN_REMINDER: MyPaymentReminderDto = {
  ...SCHOOL_REMINDER,
  dayOfMonth: 12,
  isOwnDay: true,
};
const DAY_LABEL = 'Напоминать об оплате';

/** Конкретный путь первым: mockApiByPath берёт первый подходящий префикс, а
 * `/me/payments` — префикс и пути записи дня. */
function mockPageAndDay(page: MyPaymentsPageDto, day: unknown): void {
  mockApiByPath({ [DAY_PATH]: day, [PATH]: page });
}

describe('PaymentContactNote — свой день напоминания (ADR-0161)', () => {
  it('школа напоминание не включила (в ответе нет reminder) — выбора дня нет', async () => {
    mockApiByPath({ [PATH]: PAGE });
    render(<PaymentContactNote />);

    await screen.findByText('Маше @marievyazova');

    expect(screen.queryByLabelText(DAY_LABEL)).not.toBeInTheDocument();
    expect(screen.queryByText(/Напомним в/)).not.toBeInTheDocument();
  });

  it('напоминание включено — select «как у школы» выбран, число школы в подписи, час жирным', async () => {
    mockApiByPath({ [PATH]: PAGE_WITH_REMINDER });
    render(<PaymentContactNote />);

    const select = await screen.findByLabelText(DAY_LABEL);

    expect(select).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'Как у школы — 5-го' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '31-го числа' })).toBeInTheDocument();
    const time = screen.getByText('10:00');
    expect(time.tagName).toBe('STRONG');
    expect(time.parentElement).toHaveTextContent(
      'Напомним в 10:00 по времени школы. Если в месяце нет такого числа — в последний день.',
    );
  });

  it('свой день уже выбран — он и стоит в select', async () => {
    mockApiByPath({ [PATH]: { ...PAGE, reminder: OWN_REMINDER } });
    render(<PaymentContactNote />);

    expect(await screen.findByLabelText(DAY_LABEL)).toHaveValue('12');
  });

  it('выбор дня → PUT, ответ вписан без второго GET страницы', async () => {
    mockPageAndDay(PAGE_WITH_REMINDER, OWN_REMINDER);
    render(<PaymentContactNote />);

    await userEvent.selectOptions(await screen.findByLabelText(DAY_LABEL), '12');

    await waitFor(() => expect(screen.getByLabelText(DAY_LABEL)).toHaveValue('12'));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      DAY_PATH,
      expect.objectContaining({ method: 'PUT', body: { dayOfMonth: 12 } }),
    );
    const pageLoads = mockedApiFetch.mock.calls.filter(([path]) => path === PATH);
    expect(pageLoads).toHaveLength(1);
  });

  it('«Как у школы» после своего дня — PUT с null, в select снова пустое значение', async () => {
    mockPageAndDay({ ...PAGE, reminder: OWN_REMINDER }, SCHOOL_REMINDER);
    render(<PaymentContactNote />);

    await userEvent.selectOptions(await screen.findByLabelText(DAY_LABEL), '');

    await waitFor(() => expect(screen.getByLabelText(DAY_LABEL)).toHaveValue(''));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      DAY_PATH,
      expect.objectContaining({ body: { dayOfMonth: null } }),
    );
  });

  it('ошибка сохранения — текст рядом с полем, выбор остаётся прежним', async () => {
    mockPageAndDay(
      PAGE_WITH_REMINDER,
      new ApiError('Напоминания об оплате сейчас выключены школой.', 409, 'conflict'),
    );
    render(<PaymentContactNote />);

    await userEvent.selectOptions(await screen.findByLabelText(DAY_LABEL), '12');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Напоминания об оплате сейчас выключены школой.',
    );
    expect(screen.getByLabelText(DAY_LABEL)).toHaveValue('');
    expect(screen.getByLabelText(DAY_LABEL)).toBeEnabled();
  });
});

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
