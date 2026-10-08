// Экран «Главная» — первый экран ученика (ADR-0173, плитки — ADR-0178):
// объявление, экзамены к сдаче, оплата за месяц и ближайшее занятие, плиткой
// на каждое, и только то, что к человеку относится. Сеть —
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
import { makeSchoolEvent } from '../test-support/schoolEventFixture';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { NO_EVENTS_RESPONSES, renderBoardWithRoutes } from './boardTestRender';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const STUDENT = makeMe({ id: 's1', name: 'Мария' });
const NOTHING_WAITS = 'Сейчас от вас ничего не ждут.';
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

function renderBoard(
  {
    me = STUDENT,
    board = NO_NOTICE,
    exams = [],
    payments = UNPAID_PAGE,
    lessons = [],
    extra = {},
  }: BoardData = {},
  { withNav = false } = {},
) {
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
    { withNav },
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

describe('BoardScreen — шапка и плитки', () => {
  it('заголовок «Главная», объяснения под ним нет', async () => {
    renderBoard({ lessons: [makeLesson()] });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Главная' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Здесь то, что ждёт вас/)).not.toBeInTheDocument();
    expect(screen.queryByText('Доска')).not.toBeInTheDocument();
  });

  it('плитки идут сверху вниз: экзамены, оплата, ближайшее занятие, и рубрик нет', async () => {
    const { container } = renderBoard({ exams: [makeExam()], lessons: [makeLesson()] });
    await screen.findByText('Оплаты за октябрь нет');
    await screen.findByText('Тайцзицюань');

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      'Сдать экзамен',
      'Оплата за октябрь 2026',
      'Ближайшее занятие',
    ]);
    // Рубрик «ЗАГОЛОВОК КАПСОМ» над блоками больше нет (ADR-0178).
    expect(container.querySelector('.xuanxue-eyebrow')).toBeNull();
  });

  it('пока что-то грузится, плиток нет и «ничего не ждут» тоже; потом плитки сразу вместе', async () => {
    let resolveLessons: (lessons: MyLessonDto[]) => void = () => {};
    const lessons = new Promise<MyLessonDto[]>((resolve) => {
      resolveLessons = resolve;
    });
    renderBoard({ exams: [makeExam()], lessons: lessons as unknown as MyLessonDto[] });

    await screen.findByRole('heading', { level: 1, name: 'Главная' });
    await vi.waitFor(() =>
      expect(mockedApiFetch.mock.calls.some(([path]) => path === '/me/exams')).toBe(true),
    );
    expect(screen.queryByText('Сдать экзамен')).not.toBeInTheDocument();
    expect(screen.queryByText(NOTHING_WAITS)).not.toBeInTheDocument();

    resolveLessons([makeLesson()]);

    expect(await screen.findByText('Ближайшее занятие')).toBeInTheDocument();
    expect(screen.getByText('Сдать экзамен')).toBeInTheDocument();
  });
});

describe('BoardScreen — ничего релевантного', () => {
  it('ученик без экзаменов и занятий — про них ни слова, остаётся только оплата', async () => {
    renderBoard({ exams: [], lessons: [] });

    expect(await screen.findByText('Оплаты за октябрь нет')).toBeInTheDocument();
    expect(screen.queryByText(/экзамен/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Все задания/)).not.toBeInTheDocument();
    expect(screen.queryByText(/занят/i)).not.toBeInTheDocument();
    expect(screen.queryByText(NOTHING_WAITS)).not.toBeInTheDocument();
  });

  // Оплата ученику показывается всегда, поэтому строка «ничего не ждут»
  // видна там, где карточки оплаты нет: штат в режиме ученика (ADR-0163).
  it('совсем нечего показать — одна спокойная строка и ни слова про экзамены и занятия', async () => {
    renderBoard({ me: STAFF_IN_STUDENT_MODE_ME, exams: [], lessons: [] });

    expect(await screen.findByText(NOTHING_WAITS)).toBeInTheDocument();
    expect(screen.queryByText(/экзамен/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/занят/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('сбой одного источника — «ничего не ждут» не пишем: мы не знаем', async () => {
    renderBoard({
      me: STAFF_IN_STUDENT_MODE_ME,
      lessons: new TypeError('Failed to fetch'),
    });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText(NOTHING_WAITS)).not.toBeInTheDocument();
  });
});

describe('BoardScreen — панель', () => {
  it('в панели «Главная» первым пунктом, «Доски» нет', async () => {
    renderBoard({ lessons: [makeLesson()] }, { withNav: true });
    await screen.findByText('Ближайшее занятие');

    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: /Главная/ })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: /Доска/ })).not.toBeInTheDocument();
  });

  it('экзаменов нет совсем — пункта «Задания» нет, «Занятия» на месте', async () => {
    renderBoard({ exams: [] }, { withNav: true });
    await screen.findByText('Оплаты за октябрь нет');

    const nav = within(screen.getByRole('navigation'));
    expect(nav.queryByRole('link', { name: /Задания/ })).not.toBeInTheDocument();
    expect(nav.getByRole('link', { name: /Занятия/ })).toBeInTheDocument();
  });

  it('экзамены есть, но сдавать нечего — плитки нет, пункт «Задания» есть', async () => {
    renderBoard(
      { exams: [makeExam({ attemptsAllowed: 1, attemptsUsed: 1 })] },
      { withNav: true },
    );
    await screen.findByText('Оплаты за октябрь нет');

    expect(screen.queryByText('Сдать экзамен')).not.toBeInTheDocument();
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: /Задания/ })).toBeInTheDocument();
  });

  it('экзамен к сдаче — плитка и пункт «Задания»', async () => {
    renderBoard({ exams: [makeExam()] }, { withNav: true });

    expect(await screen.findByText('Сдать экзамен')).toBeInTheDocument();
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('link', { name: /Задания/ })).toBeInTheDocument();
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
    await screen.findByText('Оплаты за октябрь нет');

    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('сбой загрузки объявления — баннер с «Обновить», остальные плитки на месте', async () => {
    renderBoard({
      board: new TypeError('Failed to fetch'),
      lessons: [makeLesson()],
    });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText('Ближайшее занятие')).toBeInTheDocument();
    await expectRetryRefetches('/me/board');
  });
});

describe('BoardScreen — плитка «Сдать экзамен»', () => {
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

  it('сдавать нечего — плитки нет, фразы про экзамены тоже', async () => {
    renderBoard({
      exams: [makeExam({ attemptsAllowed: 1, attemptsUsed: 1 })],
    });

    expect(await screen.findByText('Оплаты за октябрь нет')).toBeInTheDocument();
    expect(screen.queryByText(/экзамен/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Все задания/ })).not.toBeInTheDocument();
  });

  it('«Все задания» ведёт на «Задания»', async () => {
    const user = userEvent.setup();
    renderBoard({ exams: [makeExam()] });

    await user.click(await screen.findByRole('link', { name: 'Все задания' }));

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

  it('сбой списка экзаменов — баннер, остальные плитки живут', async () => {
    renderBoard({ exams: new TypeError('Failed to fetch'), lessons: [makeLesson()] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить экзамены. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Ближайшее занятие')).toBeInTheDocument();
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

  it('сбой загрузки оплаты — баннер на месте плитки, экзамены и занятие на месте', async () => {
    renderBoard({
      payments: new TypeError('Failed to fetch'),
      exams: [makeExam()],
      lessons: [makeLesson()],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить данные об оплате. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Сдать экзамен')).toBeInTheDocument();
    expect(screen.getByText('Ближайшее занятие')).toBeInTheDocument();
    await expectRetryRefetches('/me/payments');
  });

  // ADR-0163: штат в режиме ученика видит главную как ученик, но деньги в
  // режим не входят — плитки нет и запроса за оплатой тоже.
  it('штат в режиме ученика — плитки оплаты нет и за оплатой не ходим', async () => {
    renderBoard({ me: STAFF_IN_STUDENT_MODE_ME });
    await screen.findByText(NOTHING_WAITS);

    expect(screen.queryByRole('heading', { name: /Оплата/ })).not.toBeInTheDocument();
    expect(paymentCalls()).toHaveLength(0);
  });
});

describe('BoardScreen — ближайшее занятие', () => {
  it('первое занятие из списка в плитке «Ближайшее занятие», «Все занятия» внутри ведёт на «Занятия»', async () => {
    const user = userEvent.setup();
    renderBoard({
      lessons: [
        makeLesson({ id: 'l1', classTitle: 'Утренняя форма' }),
        makeLesson({ id: 'l2', classTitle: 'Вечерняя форма' }),
      ],
    });

    expect(await screen.findByText('Утренняя форма')).toBeInTheDocument();
    expect(screen.queryByText('Вечерняя форма')).not.toBeInTheDocument();
    const tile = screen
      .getByRole('heading', { name: 'Ближайшее занятие' })
      .closest('section');
    if (!tile) throw new Error('нет плитки занятия');

    await user.click(within(tile).getByRole('link', { name: 'Все занятия' }));
    expect(await screen.findByText('Экран занятий')).toBeInTheDocument();
  });

  it('занятий нет — плитки нет и «Все занятия» тоже', async () => {
    renderBoard({ exams: [makeExam()], lessons: [] });
    await screen.findByText('Сдать экзамен');

    expect(screen.queryByText('Ближайшее занятие')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Все занятия/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/занятий/)).not.toBeInTheDocument();
  });

  it('сбой списка занятий — баннер, остальные плитки живут', async () => {
    renderBoard({ lessons: new TypeError('Failed to fetch'), exams: [makeExam()] });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить ближайшие занятия. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Сдать экзамен')).toBeInTheDocument();
    await expectRetryRefetches('/me/lessons');
  });
});

describe('BoardScreen — события школы', () => {
  it('по плитке на событие: название заголовком, даты и место', async () => {
    renderBoard({
      extra: {
        '/me/events': [
          makeSchoolEvent({ id: 'a', title: 'Ретрит в Галилее', place: 'Кибуц Амиад' }),
          makeSchoolEvent({ id: 'b', title: 'Семинар по тайцзи' }),
        ],
      },
    });

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Ретрит в Галилее' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Семинар по тайцзи' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Кибуц Амиад')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'События' })).not.toBeInTheDocument();
  });

  it('событий нет — о них ни слова', async () => {
    renderBoard();

    await screen.findByText('Оплаты за октябрь нет');
    expect(screen.queryByText(/событ/i)).not.toBeInTheDocument();
  });

  it('сбой событий — баннер с «Обновить», повтор перечитывает их', async () => {
    renderBoard({
      extra: { '/me/events': new TypeError('Failed to fetch') },
      lessons: [makeLesson()],
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить события школы. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Ближайшее занятие')).toBeInTheDocument();
    await expectRetryRefetches('/me/events');
  });
});
