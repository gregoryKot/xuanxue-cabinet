// Сбой GET /users/teachers и повтор из листа занятия (аудит В4) — отдельный
// файл, чтобы не толкать PlanningScreen.test.tsx за 300 строк (CLAUDE.md
// «Файлы»). Мок apiFetch — по образцу PlanningScreen.test.tsx.
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
    topic: 'Пятое занятие цикла',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function mockByPath(handlers: Record<string, unknown>) {
  mockedApiFetch.mockImplementation((path: string) => {
    for (const [prefix, value] of Object.entries(handlers)) {
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

describe('PlanningScreen — сбой загрузки учителей (аудит В4)', () => {
  it('лист занятия открывается, ошибка учителей — баннер, повтор шлёт второй GET /users/teachers и убирает баннер', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/lessons': [makeLesson()],
      '/classes': [makeClass()],
      '/users/teachers': new ApiError(
        'Не удалось загрузить список учителей. Попробуйте ещё раз.',
        503,
        'unknown',
      ),
    });

    renderScreen();
    const card = await screen.findByText(/Пятое занятие цикла/);
    await user.click(card);

    const dialogTitle = await screen.findByRole('heading', { name: 'Дата занятия' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    const alert = await within(sheet).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Не удалось загрузить список учителей. Попробуйте ещё раз.',
    );

    const teachersCallsBefore = mockedApiFetch.mock.calls.filter(([p]) =>
      String(p).startsWith('/users/teachers'),
    ).length;

    mockByPath({
      '/lessons': [makeLesson()],
      '/classes': [makeClass()],
      '/users/teachers': [{ id: 't1', name: 'Дмитрий' }],
    });
    await user.click(within(alert).getByRole('button', { name: 'Обновить' }));

    await waitFor(() =>
      expect(
        mockedApiFetch.mock.calls.filter(([p]) => String(p).startsWith('/users/teachers'))
          .length,
      ).toBe(teachersCallsBefore + 1),
    );
    expect(within(sheet).queryByRole('alert')).not.toBeInTheDocument();
  });
});
