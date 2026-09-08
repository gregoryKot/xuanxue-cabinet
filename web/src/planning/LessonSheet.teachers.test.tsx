// Ошибка загрузки списка учителей на форме занятия (LessonFormFields) —
// отдельный файл, чтобы не толкать LessonSheet.test.tsx за 300 строк
// (CLAUDE.md «Файлы»). Баннер виден только при правке (!isCreate) —
// LessonFormFields.tsx.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { LessonDto } from '@xuanxue/shared';
import { LessonSheet } from './LessonSheet';

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

describe('LessonSheet — ошибка загрузки учителей (аудит В4)', () => {
  it('teachersError — виден баннер с текстом ошибки, LeaderField рядом остаётся', () => {
    render(
      <MemoryRouter initialEntries={['/planning']}>
        <LessonSheet
          lessonDto={makeLesson()}
          classes={[]}
          teachers={[]}
          teachersError="Не удалось загрузить список учителей. Попробуйте ещё раз."
          onRetryTeachers={vi.fn()}
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          onAddRecording={vi.fn().mockResolvedValue(undefined)}
          onSendNow={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось загрузить список учителей. Попробуйте ещё раз.',
    );
    expect(screen.getByLabelText('Ведущий')).toBeInTheDocument();
  });

  it('клик по «Обновить» у баннера вызывает onRetryTeachers', async () => {
    const user = userEvent.setup();
    const onRetryTeachers = vi.fn();

    render(
      <MemoryRouter initialEntries={['/planning']}>
        <LessonSheet
          lessonDto={makeLesson()}
          classes={[]}
          teachers={[]}
          teachersError="Не удалось загрузить список учителей. Попробуйте ещё раз."
          onRetryTeachers={onRetryTeachers}
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          onAddRecording={vi.fn().mockResolvedValue(undefined)}
          onSendNow={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() => expect(onRetryTeachers).toHaveBeenCalledTimes(1));
  });

  it('onRetryTeachers не передан — клик по «Обновить» не падает (запасной обработчик)', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/planning']}>
        <LessonSheet
          lessonDto={makeLesson()}
          classes={[]}
          teachers={[]}
          teachersError="Не удалось загрузить список учителей. Попробуйте ещё раз."
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          onAddRecording={vi.fn().mockResolvedValue(undefined)}
          onSendNow={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
