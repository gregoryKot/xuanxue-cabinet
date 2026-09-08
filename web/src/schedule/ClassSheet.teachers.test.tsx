// Ошибка загрузки списка учителей на форме занятия (ClassFormFields) —
// отдельный файл, чтобы не толкать ClassSheet.test.tsx за 300 строк
// (CLAUDE.md «Файлы»).
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { ClassSheet } from './ClassSheet';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.example/1',
    zoomPassword: '1234',
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

describe('ClassSheet — ошибка загрузки учителей (аудит В4)', () => {
  it('teachersError — виден баннер с текстом ошибки, LeaderField рядом остаётся', () => {
    render(
      <MemoryRouter initialEntries={['/schedule']}>
        <ClassSheet
          classDto={makeClass()}
          channels={[]}
          teachers={[]}
          teachersError="Не удалось загрузить список учителей. Попробуйте ещё раз."
          onRetryTeachers={vi.fn()}
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          onRemove={vi.fn().mockResolvedValue(undefined)}
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
      <MemoryRouter initialEntries={['/schedule']}>
        <ClassSheet
          classDto={makeClass()}
          channels={[]}
          teachers={[]}
          teachersError="Не удалось загрузить список учителей. Попробуйте ещё раз."
          onRetryTeachers={onRetryTeachers}
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          onRemove={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    await waitFor(() => expect(onRetryTeachers).toHaveBeenCalledTimes(1));
  });

  it('onRetryTeachers не передан — клик по «Обновить» не падает (запасной обработчик)', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/schedule']}>
        <ClassSheet
          classDto={makeClass()}
          channels={[]}
          teachers={[]}
          teachersError="Не удалось загрузить список учителей. Попробуйте ещё раз."
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          onRemove={vi.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Обновить' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
