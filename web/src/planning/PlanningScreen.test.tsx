// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// schedule/ScheduleScreen.test.tsx. Занятие открывается своей страницей
// (LessonEditorScreen.tsx, ADR-0033) — вместо неё в маршрутах стоит метка:
// здесь проверяется переход по адресу, сама страница — в своём тесте.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { mockApiByPath } from '../test-support/apiFetchMock';
import { makeClass, makeLesson } from '../test-support/planningFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import PlanningScreen from './PlanningScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

const NEW_MARKER = 'Здесь страница разового занятия';
const EDITOR_MARKER = 'Здесь страница занятия';
const SCHEDULE_MARKER = 'Здесь сетка расписания';

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/planning']}>
      <Routes>
        <Route path="/planning" element={<PlanningScreen />} />
        <Route path="/planning/new" element={<p>{NEW_MARKER}</p>} />
        <Route path="/planning/:lessonId" element={<p>{EDITOR_MARKER}</p>} />
        <Route path="/schedule" element={<p>{SCHEDULE_MARKER}</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Экран подписывает пояс школы только зрителю из другого пояса, поэтому пояс
// зрителя здесь задан явно, а не взят из окружения (test-support/viewerTimeZone.ts).
stubViewerTimeZone();

// Список отбрасывает дни раньше сегодняшнего (upcomingDayGroups.ts), поэтому
// часы фиксированы: с настоящими фикстуры от 8 сентября давно стали бы
// прошлым и карточки пропали бы с экрана (CLAUDE.md «Детерминизм»).
// Понедельник, 09:00 по Москве — занятия фикстур идут во вторник и дальше.
const NOW = new Date('2026-09-07T06:00:00.000Z');

// `toFake: ['Date']` — setTimeout остаётся настоящим, иначе userEvent ждёт
// сам себя (тот же приём в notifications/NotificationsScreen.test.tsx).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  mockedApiFetch.mockReset();
  vi.useRealTimers();
});

/** Карточки дней — `<li>` внутри `<ul>` (LessonDayGroup.tsx); крупная
 * карточка «Сегодня» стоит `div`-сеткой и в роль `list` не попадает. Тот же
 * текст виден на экране дважды, и запрос без этой границы падал бы на двух
 * совпадениях. */
async function findDayList() {
  return within(await screen.findByRole('list'));
}

describe('PlanningScreen — загрузка', () => {
  it('показывает скелетон, пока данные не пришли', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('PlanningScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Попробовать ещё раз», клик повторяет оба запроса', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockApiByPath({ '/lessons': [], '/classes': [makeClass()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText(/Пока ничего не запланировано/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PlanningScreen — пустое окно', () => {
  it('честное объяснение вместо пустого списка', async () => {
    mockApiByPath({ '/lessons': [], '/classes': [makeClass()] });

    renderScreen();

    // «Сегодня занятий нет.» тоже на экране (PlanningToday.tsx) — regex
    // ловит именно объяснение под списком дней.
    // Проверяем текст именно этого абзаца (не через общий getByText):
    // объяснение шапки тоже упоминает «Расписании» (EXPLANATION), и запрос
    // без привязки к элементу упал бы на два совпадения.
    const emptyMessage = await screen.findByText(/Пока ничего не запланировано/);
    expect(emptyMessage).toBeInTheDocument();
    expect(emptyMessage).toHaveTextContent(/Расписании/);
    expect(screen.getByRole('button', { name: 'Разовое занятие' })).toBeInTheDocument();
  });
});

describe('PlanningScreen — классы не загрузились, занятия загрузились', () => {
  it('список занятий виден (класс — «—»), ошибка классов отдельной строкой, не поверх списка', async () => {
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons': [makeLesson({ topic: 'Пятое занятие цикла' })],
      '/classes': new ApiError(
        'Не удалось загрузить расписание. Попробуйте ещё раз.',
        503,
        'unknown',
      ),
    });

    renderScreen();

    const dayList = await findDayList();
    expect(dayList.getByText(/Пятое занятие цикла/)).toBeInTheDocument();
    expect(dayList.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить расписание. Попробуйте ещё раз.',
    );
  });

  it('«Попробовать ещё раз» у ошибки классов повторяет только /classes', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons': [makeLesson()],
      '/classes': new ApiError('Не удалось загрузить расписание.', 503, 'unknown'),
    });
    renderScreen();
    const alert = await screen.findByRole('alert');
    const lessonsCallsBefore = mockedApiFetch.mock.calls.filter(([p]) =>
      String(p).startsWith('/lessons'),
    ).length;

    await user.click(within(alert).getByRole('button', { name: 'Попробовать ещё раз' }));

    await waitFor(() =>
      expect(
        mockedApiFetch.mock.calls.filter(([p]) => String(p).startsWith('/classes'))
          .length,
      ).toBe(2),
    );
    expect(
      mockedApiFetch.mock.calls.filter(([p]) => String(p).startsWith('/lessons')).length,
    ).toBe(lessonsCallsBefore);
  });
});

describe('PlanningScreen — список занятий', () => {
  it('карточка занятия с названием класса и темой ведёт на страницу занятия', async () => {
    const user = userEvent.setup();
    mockApiByPath({
      '/lessons': [makeLesson({ topic: 'Пятое занятие цикла' })],
      '/classes': [makeClass()],
    });

    renderScreen();

    const dayList = await findDayList();
    const card = dayList.getByText(/Пятое занятие цикла/);
    expect(dayList.getByText(/Тайцзицюань, средняя группа/)).toBeInTheDocument();
    // Пояс класса (Asia/Jerusalem) отличается от пояса зрителя (его задаёт
    // stubViewerTimeZone) — экран подписывает пояс школы (ревью п.6,
    // schedule/timezoneLabel.ts).
    expect(screen.getByText(/Asia\/Jerusalem/)).toBeInTheDocument();

    await user.click(card);
    expect(await screen.findByText(EDITOR_MARKER)).toBeInTheDocument();
  });

  it('«Разовое занятие» ведёт на страницу нового занятия', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/lessons': [], '/classes': [makeClass()] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Разовое занятие' }));

    expect(await screen.findByText(NEW_MARKER)).toBeInTheDocument();
  });

  it('«Расписание» в шапке ведёт в сетку расписания', async () => {
    const user = userEvent.setup();
    mockApiByPath({ '/lessons': [], '/classes': [makeClass()] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Расписание' }));

    expect(await screen.findByText(SCHEDULE_MARKER)).toBeInTheDocument();
  });

  it('тема не задана — карточка показывает заглушку, отменённое занятие — серым', async () => {
    mockApiByPath({
      '/lessons': [makeLesson({ id: 'l2', status: 'cancelled' })],
      '/classes': [makeClass()],
    });

    renderScreen();

    const dayList = await findDayList();
    expect(dayList.getByText(/Тема не задана/)).toBeInTheDocument();
    expect(dayList.getByText(/Отменено/)).toBeInTheDocument();
  });

  it('занятие с рассылкой ссылки — бейдж статуса; без рассылки — бейджа нет', async () => {
    mockApiByPath({
      '/lessons': [
        makeLesson({ id: 'l3', broadcast: { status: 'sent', kind: 'lesson_link' } }),
        makeLesson({ id: 'l4' }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    const dayList = await findDayList();
    expect(dayList.getByText('Ссылка ушла')).toBeInTheDocument();
  });

  it('есть запись — пометка «запись есть»; класс не найден — «—»', async () => {
    mockApiByPath({
      '/lessons': [
        makeLesson({
          classId: 'unknown-class',
          recordings: [{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }],
        }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    const dayList = await findDayList();
    expect(dayList.getByText(/запись есть/)).toBeInTheDocument();
    expect(dayList.getByText('—')).toBeInTheDocument();
  });
});

describe('PlanningScreen — список начинается с сегодня (отзыв владельца 2026-09-21)', () => {
  it('вчерашний день в список не попадает, сегодняшний остаётся', async () => {
    mockApiByPath({
      '/lessons': [
        // Воскресенье — начало окна запроса (planningWindow.ts) и вчерашний
        // день: до правки список открывался именно с него.
        makeLesson({
          id: 'вчера',
          topic: 'Вчерашнее занятие',
          startsAt: '2026-09-06T16:00:00.000Z',
        }),
        makeLesson({
          id: 'сегодня',
          topic: 'Сегодняшнее занятие',
          startsAt: '2026-09-07T16:00:00.000Z',
        }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    const dayList = await findDayList();
    expect(dayList.getByText(/Сегодняшнее занятие/)).toBeInTheDocument();
    expect(screen.queryByText(/Вчерашнее занятие/)).not.toBeInTheDocument();
  });

  it('все занятия окна уже прошли — объяснение вместо пустоты', async () => {
    mockApiByPath({
      '/lessons': [makeLesson({ startsAt: '2026-09-06T16:00:00.000Z' })],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText(/Пока ничего не запланировано/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});

describe('PlanningScreen — подписи (отзыв владельца 2026-09-12)', () => {
  it('три занятия одного класса — пояс школы назван один раз, не в каждой строке', async () => {
    mockApiByPath({
      '/lessons': [
        makeLesson(),
        makeLesson({ id: 'l2', startsAt: '2026-09-09T16:00:00.000Z' }),
        makeLesson({ id: 'l3', startsAt: '2026-09-10T16:00:00.000Z' }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(
      await screen.findByText('Время — по вашим часам. Школа живёт по Asia/Jerusalem.'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Asia\/Jerusalem/)).toHaveLength(1);
  });

  it('рядом с кнопкой сказано, что такое разовое занятие', async () => {
    mockApiByPath({ '/lessons': [], '/classes': [makeClass()] });

    renderScreen();

    expect(await screen.findByText(/семинар, перенос, замена/)).toBeInTheDocument();
  });
});

describe('PlanningScreen — число раздела (ТЗ §14, слой 3.5)', () => {
  // Ключ '/lessons/recording-summary' идёт первым: mockApiByPath матчит по
  // первому совпавшему префиксу, а он же — префикс '/lessons' (список).
  it('строка появляется с числами из /lessons/recording-summary', async () => {
    mockApiByPath({
      '/lessons/recording-summary': {
        periodDays: 30,
        lessonsPast: 4,
        lessonsWithRecording: 2,
      },
      '/lessons': [],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(
      await screen.findByText('За 30 дней прошло 4 занятия, у 2 есть запись.'),
    ).toBeInTheDocument();
  });

  it('сбой загрузки числа — строки нет, остальной экран работает', async () => {
    const { ApiError } = await import('../api/http');
    mockApiByPath({
      '/lessons/recording-summary': new ApiError('Сбой', 503, 'unknown'),
      '/lessons': [],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText(/Пока ничего не запланировано/)).toBeInTheDocument();
    expect(screen.queryByText(/прошло \d+ занят/)).not.toBeInTheDocument();
  });
});
