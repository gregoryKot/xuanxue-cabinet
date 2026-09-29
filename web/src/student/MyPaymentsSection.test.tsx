// Блок «Абонемент» (PLAN §15, слой 2.4). Сеть — mockApiByPath: путь POST
// длиннее пути GET, поэтому стоит в списке первым (совпадение по префиксу).
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto, MyPaymentsPageDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { MyPaymentsSection } from './MyPaymentsSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});
// В jsdom нет createImageBitmap — ужатие картинки подменяем готовым Blob.
vi.mock('../lib/examImageFile', () => ({
  prepareExamImage: vi.fn(() => Promise.resolve(new Blob(['x'], { type: 'image/jpeg' }))),
}));

resetApiFetchBetweenTests();
stubViewerTimeZone('Europe/Moscow');

const ME_NO_TELEGRAM: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
};
const ME_TELEGRAM: MeDto = { ...ME_NO_TELEGRAM, telegramLinked: true };

const PAGES_PATH = '/me/payments';
const UPLOAD_PATH = '/me/payments/2026-09/screenshot';
const EMPTY_PAGE: MyPaymentsPageDto = { month: '2026-09', rows: [] };

function renderSection(
  me: MeDto,
  page: MyPaymentsPageDto | Error = EMPTY_PAGE,
  authConfig: unknown = { telegramBotUsername: 'xuanxue_bot' },
) {
  mockApiByPath({ '/auth/config': authConfig, [PAGES_PATH]: page });
  return render(<MyPaymentsSection me={me} />);
}

function pageFetchCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === PAGES_PATH).length;
}

describe('MyPaymentsSection — объяснение и месяц', () => {
  it('под заголовком объяснено, кто отмечает оплату, и текущий месяц без оплаты назван', async () => {
    renderSection(ME_NO_TELEGRAM);

    expect(await screen.findByText('Оплаты за сентябрь нет')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Абонемент' })).toBeInTheDocument();
    expect(screen.getByText('школа')).toBeInTheDocument();
    expect(screen.getByText('Сентябрь 2026')).toBeInTheDocument();
  });

  it('пока идёт загрузка — скелетон, а не подписи', () => {
    mockedApiFetch.mockImplementation(() => new Promise(() => undefined));
    render(<MyPaymentsSection me={ME_NO_TELEGRAM} />);

    expect(screen.queryByText('Сентябрь 2026')).not.toBeInTheDocument();
    expect(screen.queryByText('Пока ничего нет')).not.toBeInTheDocument();
  });

  it('ошибка загрузки — баннер с повтором', async () => {
    renderSection(ME_NO_TELEGRAM, new ApiError('Сервер занят.', 500, 'unknown'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер занят.');
    expect(
      screen.getByRole('button', { name: 'Попробовать ещё раз' }),
    ).toBeInTheDocument();
  });
});

describe('MyPaymentsSection — куда вести за скриншотом', () => {
  it('без Telegram — выбор файла в кабинете, ссылки на бота нет', async () => {
    renderSection(ME_NO_TELEGRAM);

    expect(await screen.findByLabelText('Отправить скриншот')).toHaveAttribute(
      'type',
      'file',
    );
    expect(document.querySelector('a[href*="t.me"]')).toBeNull();
    expect(screen.getByText('30 дней')).toBeInTheDocument();
    expect(screen.getByText('90 дней')).toBeInTheDocument();
  });

  it('Telegram связан и бот известен — ссылка на бота с месяцем, файла нет', async () => {
    renderSection(ME_TELEGRAM);

    const link = await screen.findByRole('link', { name: 'Отправить скриншот' });
    expect(link).toHaveAttribute('href', 'https://t.me/xuanxue_bot?start=pay_2026-09');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.getByText(/останется в вашем чате Telegram/)).toBeInTheDocument();
  });

  it('Telegram связан, но имени бота нет — выбор файла в кабинете', async () => {
    renderSection(ME_TELEGRAM, EMPTY_PAGE, {});

    expect(await screen.findByLabelText('Отправить скриншот')).toHaveAttribute(
      'type',
      'file',
    );
  });
});

describe('MyPaymentsSection — загрузка скриншота', () => {
  // Read-after-write: выбрал файл → строка месяца показывает ответ записи, и
  // список абонемента заново не запрашивался (ADR-0087).
  it('после загрузки строка показывает ответ POST, GET повторно не зовётся', async () => {
    renderSection(ME_NO_TELEGRAM);
    const input = await screen.findByLabelText('Отправить скриншот');
    expect(pageFetchCount()).toBe(1);

    mockApiByPath({
      [UPLOAD_PATH]: { month: '2026-09', status: 'awaiting', hasScreenshot: true },
      '/auth/config': {},
      [PAGES_PATH]: EMPTY_PAGE,
    });
    await userEvent.upload(
      input,
      new File(['png'], 'perevod.png', { type: 'image/png' }),
    );

    expect(await screen.findByText('Ждём подтверждения')).toBeInTheDocument();
    expect(screen.queryByText('Оплаты за сентябрь нет')).not.toBeInTheDocument();
    expect(pageFetchCount()).toBe(1);
    const upload = mockedApiFetch.mock.calls.find(([path]) => path === UPLOAD_PATH);
    expect(upload?.[1]?.method).toBe('POST');
    expect(upload?.[1]?.body).toBeInstanceOf(Blob);
  });

  it('сбой загрузки — текст ошибки под кнопкой, кнопка остаётся', async () => {
    renderSection(ME_NO_TELEGRAM);
    const input = await screen.findByLabelText('Отправить скриншот');

    mockApiByPath({
      [UPLOAD_PATH]: new ApiError('Файл больше 1 МБ.', 413, 'invalid_input'),
      '/auth/config': {},
      [PAGES_PATH]: EMPTY_PAGE,
    });
    await userEvent.upload(
      input,
      new File(['png'], 'perevod.png', { type: 'image/png' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Файл больше 1 МБ.');
    expect(screen.getByLabelText('Отправить скриншот')).toBeInTheDocument();
    expect(screen.getByText('Оплаты за сентябрь нет')).toBeInTheDocument();
  });
});

describe('MyPaymentsSection — оплачено и история', () => {
  it('оплаченный месяц — дата подтверждения и никакого действия', async () => {
    renderSection(ME_NO_TELEGRAM, {
      month: '2026-09',
      rows: [
        {
          month: '2026-09',
          status: 'paid',
          confirmedAt: '2026-09-15T10:00:00.000Z',
          hasScreenshot: true,
        },
      ],
    });

    expect(await screen.findByText('Оплачено 15 сентября')).toBeInTheDocument();
    expect(screen.queryByLabelText('Отправить скриншот')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Отправить скриншот' }),
    ).not.toBeInTheDocument();
  });

  it('пустая история — «Пока ничего нет», без нулей и прочерков', async () => {
    renderSection(ME_NO_TELEGRAM);

    expect(await screen.findByText('Пока ничего нет')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Другие месяцы' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('прошлые месяцы — списком, свежие сверху, дата по часам зрителя', async () => {
    renderSection(ME_NO_TELEGRAM, {
      month: '2026-09',
      rows: [
        {
          month: '2026-08',
          status: 'paid',
          confirmedAt: '2026-08-31T22:30:00.000Z',
          hasScreenshot: false,
        },
        { month: '2026-07', status: 'unpaid', hasScreenshot: false },
      ],
    });

    const items = within(await screen.findByRole('list')).getAllByRole('listitem');
    // 31 августа 22:30 UTC — в Москве уже 1 сентября.
    expect(items.map((item) => item.textContent)).toEqual([
      'Август 2026Оплачено 1 сентября',
      'Июль 2026Оплаты за июль нет',
    ]);
  });
});
