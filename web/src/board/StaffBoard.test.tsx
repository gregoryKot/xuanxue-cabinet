// Доска штата (ADR-0174): рубрики «Ждёт вас» и «Настроить», очередь проверки
// и четыре входа в разделы. Рендерим через BoardScreen — он ветвится по роли, и
// ветку ученика тоже проверяем отсюда (штат в режиме ученика). Сеть —
// mockApiByPath (ADR-0116).
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ExamAttemptQueueItemDto,
  type MeDto,
  type MyExamDto,
  type MyLessonDto,
  type SettingsDto,
} from '@xuanxue/shared';
import { GRADING_QUEUE_PATH } from '../api/gradingPaths';
import type * as HttpModule from '../api/http';
import { makeMe, STAFF_IN_STUDENT_MODE_ME } from '../test-support/meFixture';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { renderBoardWithRoutes, SETTINGS_EMPTY } from './boardTestRender';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

const TEACHER = makeMe({ id: 't1', name: 'Дима', roles: ['teacher'] });
// «Сегодня» доски штата — new Date() (StaffBoard.tsx): фиксируем, чтобы
// «до 20 октября» не истекло от того, что тест запустили позже.
const TODAY = new Date('2026-10-10T12:00:00Z');
const QUEUE_ERROR_TEXT = 'Не удалось загрузить очередь проверки. Попробуйте ещё раз.';

function makeAttempt(id: string): ExamAttemptQueueItemDto {
  return {
    id,
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: `u-${id}`,
    userName: 'Мария',
    status: 'submitted',
    startedAt: '2026-10-05T10:00:00.000Z',
    submittedAt: '2026-10-05T10:30:00.000Z',
    expired: false,
  };
}

interface StaffBoardData {
  me?: MeDto;
  settings?: SettingsDto | Error;
  queue?: ExamAttemptQueueItemDto[] | Error;
}

function renderStaffBoard({
  me = TEACHER,
  settings = SETTINGS_EMPTY,
  queue = [],
}: StaffBoardData = {}) {
  // Ответы ученических запросов нужны только штату в режиме ученика.
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': {},
    '/settings': settings,
    '/me/board': { notice: null },
    [GRADING_QUEUE_PATH]: queue,
    '/me/exams': [] satisfies MyExamDto[],
    '/me/lessons': [] satisfies MyLessonDto[],
  });
  return renderBoardWithRoutes(
    <>
      <Route path="/grading" element={<p>Экран проверки</p>} />
      <Route path="/planning" element={<p>Экран занятий штата</p>} />
      <Route path="/broadcasts" element={<p>Экран рассылок</p>} />
      <Route path="/materials" element={<p>Экран материалов</p>} />
      <Route path="/school" element={<p>Экран школы</p>} />
    </>,
  );
}

function callsTo(prefix: string) {
  return mockedApiFetch.mock.calls.filter(([path]) => path.startsWith(prefix));
}

describe('StaffBoard — шапка и рубрики', () => {
  it('«Доска» и объяснение: работы на проверке и входы в разделы', async () => {
    renderStaffBoard();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    const explanation = screen.getByText(/Здесь объявление ученикам/);
    expect(explanation).toHaveTextContent('работы на проверке');
    expect(explanation).toHaveTextContent(
      'входы в расписание, рассылки, материалы и настройки школы',
    );
  });

  it('рубрики идут сверху вниз: «Ждёт вас», «Настроить», рубрик ученика нет', async () => {
    renderStaffBoard();
    await screen.findByText('Пока нечего проверять.');

    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['Ждёт вас', 'Настроить']);
    expect(screen.queryByText('Сдавать сейчас')).not.toBeInTheDocument();
    expect(screen.queryByText(/Оплата/)).not.toBeInTheDocument();
    expect(screen.queryByText('Ближайшее занятие')).not.toBeInTheDocument();
  });
});

describe('StaffBoard — карточка «Проверка»', () => {
  it('в очереди две работы — число внутри карточки', async () => {
    renderStaffBoard({ queue: [makeAttempt('a1'), makeAttempt('a2')] });

    expect(await screen.findByText('2 работы ждут проверки.')).toBeInTheDocument();
  });

  it('очередь пуста — честная фраза, не «0 работ»', async () => {
    renderStaffBoard();

    expect(await screen.findByText('Пока нечего проверять.')).toBeInTheDocument();
    expect(screen.queryByText(/0 работ/)).not.toBeInTheDocument();
  });

  it('карточка ведёт на «Проверку»', async () => {
    const user = userEvent.setup();
    renderStaffBoard({ queue: [makeAttempt('a1')] });

    await user.click(await screen.findByRole('link', { name: /Проверка/ }));

    expect(await screen.findByText('Экран проверки')).toBeInTheDocument();
  });

  it('сбой очереди — баннер с «Обновить», карточка и входы на месте, повтор перечитывает очередь', async () => {
    const user = userEvent.setup();
    renderStaffBoard({ queue: new TypeError('Failed to fetch') });

    expect(await screen.findByRole('alert')).toHaveTextContent(QUEUE_ERROR_TEXT);
    expect(screen.getByRole('link', { name: /Проверка/ })).toBeInTheDocument();
    for (const name of ['Расписание', 'Рассылки', 'Материалы', 'Школа']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }

    expect(callsTo(GRADING_QUEUE_PATH)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(callsTo(GRADING_QUEUE_PATH)).toHaveLength(2);
  });
});

describe('StaffBoard — входы в «Настроить»', () => {
  it('четыре карточки-входа: расписание, рассылки, материалы, школа (ADR-0176)', async () => {
    renderStaffBoard();
    await screen.findByRole('heading', { name: 'Настроить' });

    const hrefs = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href) => href !== '/grading');
    expect(hrefs).toEqual(['/planning', '/broadcasts', '/materials', '/school']);
  });

  it.each([
    ['Расписание', 'Экран занятий штата'],
    ['Рассылки', 'Экран рассылок'],
    ['Материалы', 'Экран материалов'],
    ['Школа', 'Экран школы'],
  ])('«%s» ведёт на свой экран', async (name, screenText) => {
    const user = userEvent.setup();
    renderStaffBoard();
    await screen.findByRole('heading', { name: 'Настроить' });

    await user.click(screen.getByRole('link', { name: new RegExp(name) }));

    expect(await screen.findByText(screenText)).toBeInTheDocument();
  });
});

describe('StaffBoard — запросы и объявление', () => {
  it('запросов ученика нет, настройки школы запрашиваются один раз', async () => {
    renderStaffBoard();
    await screen.findByText('Пока нечего проверять.');
    await screen.findByRole('button', { name: /Добавить объявление/ });

    for (const prefix of ['/me/exams', '/me/lessons', '/me/payments', '/me/board']) {
      expect(callsTo(prefix)).toHaveLength(0);
    }
    expect(callsTo('/settings')).toHaveLength(1);
  });

  it('объявление школы стоит и на доске штата', async () => {
    renderStaffBoard({
      settings: {
        ...SETTINGS_EMPTY,
        boardNotice: { text: 'Ретрит в ноябре', until: '2026-10-20' },
      },
    });

    const notice = await screen.findByRole('complementary', {
      name: 'Объявление школы',
    });
    expect(notice).toHaveTextContent('Ретрит в ноябре');
  });

  // Настройки не пришли — объявления не видно, но доска живёт: баннер с
  // повтором, очередь и входы на месте, «Обновить» перечитывает настройки.
  it('сбой загрузки настроек — баннер с «Обновить», повтор перечитывает настройки', async () => {
    const user = userEvent.setup();
    renderStaffBoard({ settings: new TypeError('Failed to fetch') });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить настройки. Попробуйте ещё раз.',
    );
    expect(await screen.findByText('Пока нечего проверять.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Добавить объявление/ })).toBeNull();

    expect(callsTo('/settings')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(callsTo('/settings')).toHaveLength(2);
  });
});

describe('StaffBoard — роли', () => {
  it.each(['admin', 'assistant'] as const)('%s видит ту же доску штата', async (role) => {
    renderStaffBoard({ me: makeMe({ roles: [role] }) });

    expect(await screen.findByRole('heading', { name: 'Настроить' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Расписание/ })).toBeInTheDocument();
  });

  it('штат в режиме ученика — доска ученика, очередь проверки не запрашивается', async () => {
    renderStaffBoard({ me: STAFF_IN_STUDENT_MODE_ME });

    expect(await screen.findByText('Сдавать сейчас')).toBeInTheDocument();
    expect(screen.queryByText('Настроить')).not.toBeInTheDocument();
    expect(callsTo(GRADING_QUEUE_PATH)).toHaveLength(0);
  });
});
