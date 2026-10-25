import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import PaymentsScreen from './PaymentsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

function row(
  userId: string,
  userName: string,
  overrides: Partial<PaymentDto> = {},
): PaymentDto {
  return { userId, userName, month: '2026-09', status: 'unpaid', ...overrides };
}

const AWAITING = row('u1', 'Аня', { status: 'awaiting' });
const PAID = row('u2', 'Боря', {
  status: 'paid',
  confirmedAt: '2026-09-15T10:00:00.000Z',
  amountMinor: 25000,
});
const UNPAID = row('u3', 'Вера');

function page(rows: PaymentDto[], month = '2026-09'): PaymentsPageDto {
  return { month, rows };
}

/** Запись стоит раньше списка: `/payments?` не совпадает с путями записи, но
 * порядок «частное раньше общего» держим для читаемости. */
function mockList(value: PaymentsPageDto, extra: Record<string, unknown> = {}) {
  mockApiByPath({ ...extra, '/payments?': value });
}

describe('PaymentsScreen — загрузка', () => {
  it('пока список едет — скелетон и закрытые кнопки месяца', () => {
    mockedApiFetch.mockImplementation(() => new Promise(() => undefined));

    render(<PaymentsScreen />);

    expect(screen.getByRole('heading', { level: 1, name: 'Оплаты' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Следующий месяц' })).toBeDisabled();
  });

  it('сбой — баннер с текстом и повтором', async () => {
    mockApiByPath({ '/payments?': new ApiError('Доступ закрыт', 403, 'forbidden') });
    render(<PaymentsScreen />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Доступ закрыт');
    expect(within(alert).getByRole('button')).toBeInTheDocument();
  });
});

describe('PaymentsScreen — группы', () => {
  it('три группы по порядку: ждут подтверждения, оплатили, без оплаты', async () => {
    mockList(page([UNPAID, PAID, AWAITING]));
    render(<PaymentsScreen />);

    await screen.findByText('Ждут подтверждения');

    const titles = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles).toEqual(['Ждут подтверждения', 'Оплатили', 'Без оплаты']);
    expect(screen.getByText('Прислали снимок перевода')).toBeInTheDocument();
    expect(screen.getByText('Оплачено 15 сентября · 250 ₪')).toBeInTheDocument();
    expect(screen.getByText('Оплаты пока нет')).toBeInTheDocument();
  });

  it('месяц из ответа сервера — в переключателе с заглавной буквы', async () => {
    mockList(page([AWAITING]));
    render(<PaymentsScreen />);

    expect(await screen.findByText('Сентябрь 2026')).toBeInTheDocument();
  });

  it('пустой месяц — строка про ссылку-приглашение, без групп', async () => {
    mockList(page([]));
    render(<PaymentsScreen />);

    expect(await screen.findByText('ссылке-приглашению')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});

describe('PaymentsScreen — действия', () => {
  it('«Подтвердить» переносит строку в «Оплатили», второго GET нет', async () => {
    const confirmed = {
      ...AWAITING,
      status: 'paid',
      confirmedAt: '2026-09-20T10:00:00.000Z',
    };
    mockList(page([AWAITING, UNPAID]), { '/payments/u1/2026-09/confirm': confirmed });
    render(<PaymentsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить' }));

    expect(await screen.findByText('Оплатили')).toBeInTheDocument();
    expect(screen.queryByText('Ждут подтверждения')).not.toBeInTheDocument();
    expect(screen.getByText('Оплачено 20 сентября')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
  });

  it('«Отметить оплату» у неоплатившего — вторичная кнопка, строка уходит в «Оплатили»', async () => {
    const marked = { ...UNPAID, status: 'paid' };
    mockList(page([UNPAID]), { '/payments/u3/2026-09/confirm': marked });
    render(<PaymentsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Отметить оплату' }));

    expect(await screen.findByText('Оплатили')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отметить оплату' })).toBeNull();
  });

  it('«Снять подтверждение» возвращает строку в «Без оплаты»', async () => {
    mockList(page([PAID]), {
      '/payments/u2/2026-09/revoke': { ...PAID, status: 'unpaid' },
    });
    render(<PaymentsScreen />);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Снять подтверждение' }),
    );

    expect(await screen.findByText('Без оплаты')).toBeInTheDocument();
    expect(screen.getByText('Оплаты пока нет')).toBeInTheDocument();
  });

  it('отказ сервера — сообщение под строкой, строка остаётся на месте', async () => {
    mockList(page([AWAITING]), {
      '/payments/u1/2026-09/confirm': new ApiError('Ученик не найден.', 404, 'not_found'),
    });
    render(<PaymentsScreen />);

    await userEvent.click(await screen.findByRole('button', { name: 'Подтвердить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Ученик не найден.');
    expect(screen.getByText('Ждут подтверждения')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Подтвердить' })).toBeEnabled();
  });
});

describe('PaymentsScreen — месяц', () => {
  it('«Предыдущий месяц» перечитывает список с month=', async () => {
    mockApiByPath({
      '/payments?month=2026-08': page([PAID], '2026-08'),
      '/payments?': page([AWAITING]),
    });
    render(<PaymentsScreen />);
    await screen.findByText('Сентябрь 2026');

    await userEvent.click(screen.getByRole('button', { name: 'Предыдущий месяц' }));

    expect(await screen.findByText('Август 2026')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      '/payments?month=2026-08&limit=200',
      expect.anything(),
    );
  });

  it('«Следующий месяц» переходит через границу года', async () => {
    mockApiByPath({
      '/payments?month=2027-01': page([], '2027-01'),
      '/payments?': page([AWAITING], '2026-12'),
    });
    render(<PaymentsScreen />);
    await screen.findByText('Декабрь 2026');

    await userEvent.click(screen.getByRole('button', { name: 'Следующий месяц' }));

    expect(await screen.findByText('Январь 2027')).toBeInTheDocument();
  });
});

describe('PaymentsScreen — снимок перевода', () => {
  it('upload — «Показать снимок» раскрывает картинку с адресом из API, «Скрыть» убирает', async () => {
    mockList(page([{ ...AWAITING, screenshotKind: 'upload' }]));
    render(<PaymentsScreen />);

    const toggle = await screen.findByRole('button', { name: 'Показать снимок' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);

    const image = screen.getByRole('img', {
      name: 'Снимок перевода: Аня, сентябрь 2026',
    });
    expect(image).toHaveAttribute('src', '/api/payments/u1/2026-09/screenshot');
    await userEvent.click(screen.getByRole('button', { name: 'Скрыть снимок' }));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('telegram — тихая строка про бота, кнопки и картинки нет', async () => {
    mockList(page([{ ...AWAITING, screenshotKind: 'telegram' }]));
    render(<PaymentsScreen />);

    expect(
      await screen.findByText('Снимок прислали боту — он в Telegram, в чате с ботом'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показать снимок' })).toBeNull();
  });

  it('снимка нет — ни кнопки, ни строки', async () => {
    mockList(page([AWAITING]));
    render(<PaymentsScreen />);

    await screen.findByText('Ждут подтверждения');

    expect(screen.queryByText(/снимок/i, { selector: 'button' })).toBeNull();
    expect(screen.queryByText(/Снимок прислали боту/)).toBeNull();
  });
});
