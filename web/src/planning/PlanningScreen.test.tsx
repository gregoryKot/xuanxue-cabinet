// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по образцу
// schedule/ScheduleScreen.test.tsx.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto, LessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import PlanningScreen from './PlanningScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: '',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockByPath(handlers: Record<string, unknown>) {
  // '/users/teachers' — дефолт []: экран грузит его на каждом монтировании
  // (useTeachers, аудит В4), но почти ни один тест здесь не проверяет
  // ведущего — без дефолта пришлось бы дописывать путь в каждый вызов.
  // Тест, которому нужен конкретный ответ или сбой, передаёт свой — он
  // перекрывает дефолт (spread ниже).
  const withDefaults = { '/users/teachers': [], ...handlers };
  mockedApiFetch.mockImplementation((path: string) => {
    for (const [prefix, value] of Object.entries(withDefaults)) {
      if (path.startsWith(prefix)) {
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
      }
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <PlanningScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

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
    mockByPath({
      '/lessons': new ApiError('Сервис недоступен', 503, 'unknown'),
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockByPath({ '/lessons': [], '/classes': [makeClass()] });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText(/занятий нет/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('PlanningScreen — пустое окно', () => {
  it('честное объяснение вместо пустого списка', async () => {
    mockByPath({ '/lessons': [], '/classes': [makeClass()] });

    renderScreen();

    expect(await screen.findByText(/занятий нет/)).toBeInTheDocument();
    expect(screen.getByText(/Расписании/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Разовое занятие' })).toBeInTheDocument();
  });
});

describe('PlanningScreen — классы не загрузились, занятия загрузились', () => {
  it('список занятий виден (класс — «—»), ошибка классов отдельной строкой, не поверх списка', async () => {
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/lessons': [makeLesson({ topic: 'Пятое занятие цикла' })],
      '/classes': new ApiError(
        'Не удалось загрузить расписание. Попробуйте ещё раз.',
        503,
        'unknown',
      ),
    });

    renderScreen();

    expect(await screen.findByText(/Пятое занятие цикла/)).toBeInTheDocument();
    expect(screen.getByText(/· —/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить расписание. Попробуйте ещё раз.',
    );
  });

  it('«Попробовать ещё раз» у ошибки классов повторяет только /classes', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
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

  it('«Разовое занятие» — ни одного класса: объяснение и ссылка на «Расписание», без формы', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/lessons': [],
      '/classes': new ApiError(
        'Не удалось загрузить расписание. Попробуйте ещё раз.',
        503,
        'unknown',
      ),
    });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Разовое занятие' }));

    const dialogTitle = await screen.findByRole('heading', { name: 'Разовое занятие' });
    const form = dialogTitle.closest('form') as HTMLFormElement;
    expect(
      within(form).getByText(/Сначала добавьте занятие в расписании/),
    ).toBeInTheDocument();
    expect(within(form).getByRole('link', { name: /Расписание/ })).toHaveAttribute(
      'href',
      '/schedule',
    );
    expect(
      within(form).queryByRole('button', { name: 'Сохранить' }),
    ).not.toBeInTheDocument();
  });
});

describe('PlanningScreen — список занятий', () => {
  it('карточка занятия с названием класса, темой, открывает лист по клику', async () => {
    const user = userEvent.setup();
    mockByPath({
      '/lessons': [makeLesson({ topic: 'Пятое занятие цикла' })],
      '/classes': [makeClass()],
    });

    renderScreen();

    const card = await screen.findByText(/Пятое занятие цикла/);
    expect(card).toBeInTheDocument();
    expect(screen.getByText(/Тайцзицюань, средняя группа/)).toBeInTheDocument();
    // Пояс класса (Asia/Jerusalem) отличается от браузерного (UTC в тестах) —
    // бейдж пояса на карточке (ревью п.6, schedule/timezoneLabel.ts).
    expect(screen.getByText(/Asia\/Jerusalem/)).toBeInTheDocument();

    await user.click(card);
    expect(
      await screen.findByRole('heading', { name: 'Дата занятия' }),
    ).toBeInTheDocument();
  });

  it('«Разовое занятие» открывает пустой лист, сохранение шлёт POST', async () => {
    const user = userEvent.setup();
    mockByPath({ '/lessons': [], '/classes': [makeClass()] });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Разовое занятие' }));

    const dialogTitle = await screen.findByRole('heading', { name: 'Разовое занятие' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    await user.type(
      within(sheet).getByLabelText('Дата и время начала'),
      '2026-09-08T19:00',
    );

    mockedApiFetch.mockResolvedValueOnce(makeLesson());
    mockByPath({ '/lessons': [], '/classes': [makeClass()] });
    await user.click(within(sheet).getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/lessons',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('тема не задана — карточка показывает заглушку, отменённое занятие — серым', async () => {
    mockByPath({
      '/lessons': [makeLesson({ id: 'l2', status: 'cancelled' })],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText(/Тема не задана/)).toBeInTheDocument();
    expect(screen.getByText(/Отменено/)).toBeInTheDocument();
  });

  it('занятие с рассылкой ссылки — бейдж статуса; без рассылки — бейджа нет', async () => {
    mockByPath({
      '/lessons': [
        makeLesson({ id: 'l3', broadcast: { status: 'sent', kind: 'lesson_link' } }),
        makeLesson({ id: 'l4' }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText('Ссылка ушла')).toBeInTheDocument();
  });

  it('есть запись — пометка «запись есть»; класс не найден — «—»', async () => {
    mockByPath({
      '/lessons': [
        makeLesson({
          classId: 'unknown-class',
          recordings: [{ id: 'r1', title: 'Часть 1', url: 'https://youtu.be/1' }],
        }),
      ],
      '/classes': [makeClass()],
    });

    renderScreen();

    expect(await screen.findByText(/запись есть/)).toBeInTheDocument();
    expect(screen.getByText(/· —$/)).toBeInTheDocument();
  });
});
