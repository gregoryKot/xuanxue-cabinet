// Экран ученика — состояния загрузки списка (ТЗ student-screen.md,
// «Тесты»): ошибка — баннер с повтором, пусто — своя фраза, есть данные —
// карточки. Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts»), по
// образцу schedule/ScheduleScreen.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyLessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { StudentLessonsScreen } from './StudentLessonsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function makeLesson(overrides: Partial<MyLessonDto> = {}): MyLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Тайцзицюань',
    groupLabel: 'Средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.us/j/123',
    topic: '',
    status: 'scheduled',
    ...overrides,
  };
}

describe('StudentLessonsScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и «Обновить», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    render(<StudentLessonsScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    const retry = screen.getByRole('button', { name: 'Обновить' });

    mockedApiFetch.mockResolvedValueOnce([]);
    await user.click(retry);

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
  });
});

describe('StudentLessonsScreen — пусто', () => {
  it('пустой список — своя фраза, не «0 занятий»', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    render(<StudentLessonsScreen />);

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    expect(screen.queryByText(/0 занят/)).not.toBeInTheDocument();
  });
});

describe('StudentLessonsScreen — есть занятия', () => {
  it('рендерит карточку по каждому занятию списка', async () => {
    mockedApiFetch.mockResolvedValueOnce([
      makeLesson({ id: 'l1', classTitle: 'Тайцзицюань' }),
      makeLesson({ id: 'l2', classTitle: 'Цигун' }),
    ]);
    render(<StudentLessonsScreen />);

    expect(await screen.findByText(/Тайцзицюань/)).toBeInTheDocument();
    expect(screen.getByText(/Цигун/)).toBeInTheDocument();
  });
});
