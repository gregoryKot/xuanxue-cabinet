// Экран «Доска» — первый экран ученика (ADR-0173): объявление, экзамены к
// сдаче, оплата за месяц и ближайшее занятие, каждое со своим запросом. Сеть —
// mockApiByPath (ADR-0116), список экзаменов идёт через настоящий
// MyExamsProvider, как в оболочке. Навигацию проверяем в MemoryRouter.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type {
  MeDto,
  MyBoardDto,
  MyExamDto,
  MyLessonDto,
  MyPaymentsPageDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { examSeenPath } from '../test-support/examSeenPath';
import { makeMe, STAFF_IN_STUDENT_MODE_ME } from '../test-support/meFixture';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { NO_EVENTS_RESPONSES, renderBoardWithRoutes } from './boardTestRender';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const STUDENT = makeMe({ id: 's1', name: 'Мария' });
const CONTACT = 'Маше Вязовой — например, в Telegram @marievyazova';

const NO_NOTICE: MyBoardDto = { notice: null };
const UNPAID_PAGE: MyPaymentsPageDto = { month: '2026-10', rows: [], contact: CONTACT };

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

function makeLesson(overrides: Partial<MyLessonDto> = {}): MyLessonDto {
  return {
    id: 'l1',
    startsAt: '2030-09-08T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Тайцзицюань',
    groupLabel: 'Средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.us/j/123',
    topic: '',
    status: 'scheduled',
    tags: [],
    ...overrides,
  };
}

interface BoardData {
  me?: MeDto;
  board?: MyBoardDto | Error;
  exams?: MyExamDto[] | Error;
  payments?: MyPaymentsPageDto | Error;
  lessons?: MyLessonDto[] | Error;
  extra?: Record<string, unknown>;
}

function renderBoard({
  me = STUDENT,
  board = NO_NOTICE,
  exams = [],
  payments = UNPAID_PAGE,
  lessons = [],
  extra = {},
}: BoardData = {}) {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': {},
    ...NO_EVENTS_RESPONSES,
    ...extra,
    '/me/board': board,
    '/me/exams': exams,
    '/me/payments': payments,
    '/me/lessons': lessons,
  });
  return renderBoardWithRoutes(
    <>
      <Route path="/attempts/:id" element={<p>Экран сдачи</p>} />
      <Route path="/tasks" element={<p>Экран заданий</p>} />
      <Route path="/lessons" element={<p>Экран занятий</p>} />
    </>,
  );
}

function paymentCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path.startsWith('/me/payments'));
}

/** «Обновить» в баннере секции повторяет ровно её запрос: один GET до нажатия,
 * два после — остальные секции за собой не тянет. */
async function expectRetryRefetches(path: string) {
  const callsTo = () => mockedApiFetch.mock.calls.filter(([p]) => p === path).length;
  expect(callsTo()).toBe(1);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Обновить' }));
  expect(callsTo()).toBe(2);
}

describe('BoardScreen — шапка', () => {
  it('«Доска» и объяснение, что на ней лежит', async () => {
    renderBoard();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Здесь то, что ждёт вас сейчас/)).toHaveTextContent(
      'экзамены к сдаче, оплата за месяц, объявления и события школы. Ближайшее занятие — внизу.',
    );
  });

  it('секции идут сверху вниз: экзамены, оплата, ближайшее занятие', async () => {
    renderBoard();
    // Заголовок оплаты меняется, когда приходит ответ, — ждём все три секции.
    await screen.findByText('Экзаменов к сдаче нет.');
    await screen.findByText('Оплаты за октябрь нет');
    await screen.findByText('Ближайших занятий пока нет.');

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Сдавать сейчас',
      'Оплата за октябрь 2026',
      'Ближайшее занятие',
    ]);
  });
});

describe('BoardScreen — объявление школы', () => {
  it('объявление есть — текст со ссылкой на ник и «До 20 октября»', async () => {
    renderBoard({
      board: {
        notice: { text: 'Ретрит в ноябре, пишите @marievyazova', until: '2026-10-20' },
      },
    });

    const notice = await screen.findByRole('complementary', {
      name: 'Объявление школы',
    });
    expect(notice).toHaveTextContent('Ретрит в ноябре, пишите');
    expect(within(notice).getByRole('link', { name: '@marievyazova' })).toHaveAttribute(
      'href',
      'https://t.me/marievyazova',
    );
    expect(within(notice).getByText('До 20 октября')).toBeInTheDocument();
  });

  it('объявления нет — секции нет вовсе, пустой плашки тоже', async () => {
    renderBoard();
    await screen.findByText('Экзаменов к сдаче нет.');

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('сбой загрузки объявления — баннер с «Обновить», остальные секции на месте', async () => {
    renderBoard({ board: new TypeError('Failed to fetch') });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText('Экзаменов к сдаче нет.')).toBeInTheDocument();
    await expectRetryRefetches('/me/board');
  });
});

describe('BoardScreen — «Сдавать сейчас»', () => {
  it('в списке только то, что ждёт ученика: сданное и законченное не показываем', async () => {
    renderBoard({
      exams: [
        makeExam({ id: 'e1', title: 'Ещё не начинал' }),
        makeExam({ id: 'e2', title: 'Все попытки кончились', attemptsUsed: 1 }),
        makeExam({
          id: 'e3',
          title: 'Уже отправил',
          attemptsAllowed: 2,
          lastAttempt: { id: 'a1', status: 'submitted', expired: false },
        }),
      ],
    });

    expect(await screen.findByText('Ещё не начинал')).toBeInTheDocument();
    expect(screen.queryByText('Все попытки кончились')).not.toBeInTheDocument();
    expect(screen.queryByText('Уже отправил')).not.toBeInTheDocument();
  });

  it('сдавать нечего — честная фраза, не «0»', async () => {
    renderBoard({
      exams: [makeExam({ attemptsAllowed: 1, attemptsUsed: 1 })],
    });

    expect(await screen.findByText('Экзаменов к сдаче нет.')).toBeInTheDocument();
  });

  it('«Все задания» ведёт на «Задания»', async () => {
    const user = userEvent.setup();
    renderBoard();

    await user.click(await screen.findByRole('link', { name: /Все задания/ }));

    expect(await screen.findByText('Экран заданий')).toBeInTheDocument();
  });

  it('«Начать» стартует попытку и уводит на экран сдачи, как на «Заданиях»', async () => {
    const user = userEvent.setup();
    renderBoard({
      extra: {
        [examSeenPath('e1')]: [makeExam({ seen: true })],
        '/exams/e1/attempts': { id: 'attempt-1' },
      },
      exams: [makeExam()],
    });

    await user.click(await screen.findByRole('button', { name: 'Начать' }));

    expect(await screen.findByText('Экран сдачи')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/exams/e1/attempts', { method: 'POST' });
  });

  it('форма с лимитом времени — сперва вопрос «Вы начинаете экзамен», попытка не стартует', async () => {
    const user = userEvent.setup();
    renderBoard({
      exams: [makeExam({ timeLimitMin: 40 })],
    });

    await user.click(await screen.findByRole('button', { name: 'Начать' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/exams/e1/attempts',
      expect.anything(),
    );
  });

  it('сбой списка экзаменов — баннер, остальные секции живут', async () => {
    renderBoard({ exams: new TypeError('Failed to fetch') });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить экзамены. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    await expectRetryRefetches('/me/exams');
  });
});

describe('BoardScreen — оплата за месяц', () => {
  it('оплаты нет — заголовок с месяцем, статус и кому прислать скриншот', async () => {
    renderBoard();

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Оплата за октябрь 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Оплаты за октябрь нет')).toBeInTheDocument();
    expect(screen.getByText(/Отправьте скриншот об оплате/)).toHaveTextContent(
      'Отправьте скриншот об оплате Маше Вязовой — например, в Telegram @marievyazova.',
    );
    expect(screen.getByRole('link', { name: '@marievyazova' })).toBeInTheDocument();
  });

  it('кнопки загрузки скриншота нет — снимок уходит бухгалтеру напрямую (ADR-0159)', async () => {
    renderBoard();
    await screen.findByText('Оплаты за октябрь нет');

    expect(screen.queryByRole('button', { name: /скриншот/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/скриншот/i)).not.toBeInTheDocument();
  });

  it('оплачено — дата подтверждения, просьбы прислать скриншот нет', async () => {
    renderBoard({
      payments: {
        ...UNPAID_PAGE,
        rows: [
          {
            month: '2026-10',
            status: 'paid',
            confirmedAt: '2026-10-03T09:00:00.000Z',
            hasScreenshot: false,
          },
        ],
      },
    });

    expect(await screen.findByText('Оплачено 3 октября')).toBeInTheDocument();
    expect(screen.queryByText(/Отправьте скриншот/)).not.toBeInTheDocument();
  });

  it('ждём подтверждения — статус без просьбы', async () => {
    renderBoard({
      payments: {
        ...UNPAID_PAGE,
        rows: [{ month: '2026-10', status: 'awaiting', hasScreenshot: true }],
      },
    });

    expect(await screen.findByText('Ждём подтверждения')).toBeInTheDocument();
    expect(screen.queryByText(/Отправьте скриншот/)).not.toBeInTheDocument();
  });

  it('сбой загрузки оплаты — баннер внутри секции, экзамены и занятие на месте', async () => {
    renderBoard({ payments: new TypeError('Failed to fetch') });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить данные об оплате. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Экзаменов к сдаче нет.')).toBeInTheDocument();
    expect(screen.getByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    await expectRetryRefetches('/me/payments');
  });

  // ADR-0163: штат в режиме ученика видит доску как ученик, но деньги в режим
  // не входят — карточки нет и запроса за оплатой тоже.
  it('штат в режиме ученика — карточки оплаты нет и за оплатой не ходим', async () => {
    renderBoard({ me: STAFF_IN_STUDENT_MODE_ME });
    await screen.findByText('Экзаменов к сдаче нет.');

    expect(screen.queryByRole('heading', { name: /Оплата/ })).not.toBeInTheDocument();
    expect(paymentCalls()).toHaveLength(0);
  });
});

describe('BoardScreen — ближайшее занятие', () => {
  it('первое занятие из списка крупной карточкой, «Все занятия» ведёт на «Занятия»', async () => {
    const user = userEvent.setup();
    renderBoard({
      lessons: [
        makeLesson({ id: 'l1', classTitle: 'Утренняя форма' }),
        makeLesson({ id: 'l2', classTitle: 'Вечерняя форма' }),
      ],
    });

    expect(await screen.findByText('Утренняя форма')).toBeInTheDocument();
    expect(screen.queryByText('Вечерняя форма')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /Все занятия/ }));
    expect(await screen.findByText('Экран занятий')).toBeInTheDocument();
  });

  it('занятий нет — честная фраза', async () => {
    renderBoard();

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
  });

  it('сбой списка занятий — баннер, остальные секции живут', async () => {
    renderBoard({ lessons: new TypeError('Failed to fetch') });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить ближайшие занятия. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Экзаменов к сдаче нет.')).toBeInTheDocument();
    await expectRetryRefetches('/me/lessons');
  });
});
