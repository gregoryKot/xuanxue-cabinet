// Сбой GET /users/teachers и повтор из листа занятия (аудит В4) — отдельный
// файл, чтобы не толкать ScheduleScreen.test.tsx за 300 строк (CLAUDE.md
// «Файлы»). Мок apiFetch — по образцу ScheduleScreen.test.tsx, но с разбором
// по пути: экран одновременно грузит /classes, /channels и /users/teachers.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import ScheduleScreen from './ScheduleScreen';

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
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
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
      <ScheduleScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('ScheduleScreen — сбой загрузки учителей (аудит В4)', () => {
  it('лист занятия открывается, ошибка учителей — баннер, повтор шлёт второй GET /users/teachers и убирает баннер', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockByPath({
      '/classes': [makeClass()],
      '/channels': [],
      '/users/teachers': new ApiError(
        'Не удалось загрузить список учителей. Попробуйте ещё раз.',
        503,
        'unknown',
      ),
    });

    renderScreen();
    const card = await screen.findByText(/19:00–20:00/);
    await user.click(card);

    const dialogTitle = await screen.findByRole('heading', { name: 'Занятие' });
    const sheet = dialogTitle.closest('form') as HTMLFormElement;
    const alert = await within(sheet).findByRole('alert');
    expect(alert).toHaveTextContent(
      'Не удалось загрузить список учителей. Попробуйте ещё раз.',
    );

    const teachersCallsBefore = mockedApiFetch.mock.calls.filter(([p]) =>
      String(p).startsWith('/users/teachers'),
    ).length;

    mockByPath({
      '/classes': [makeClass()],
      '/channels': [],
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

  it('каналы ещё грузятся при открытии листа — лист открывается с пустым списком каналов', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/classes')) return Promise.resolve([makeClass()]);
      if (path.startsWith('/users/teachers')) return Promise.resolve([]);
      // '/channels' намеренно не резолвится — activeChannels остаётся null,
      // пока лист уже можно открыть (кнопка ждёт только классы).
      return new Promise(() => {});
    });

    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Добавить занятие' }));

    expect(
      await screen.findByRole('heading', { name: 'Новое занятие' }),
    ).toBeInTheDocument();
  });
});
