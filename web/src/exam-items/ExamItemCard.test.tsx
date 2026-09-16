import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamItemCard } from './ExamItemCard';

function makeItem(overrides: Partial<ExamItemDto> = {}): ExamItemDto {
  return {
    id: 'e1',
    kind: 'text',
    prompt: 'Опишите принцип песчинки',
    options: [],
    tags: [],
    status: 'draft',
    version: 1,
    history: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ExamItemCard', () => {
  it('показывает формулировку, тип и статус', () => {
    render(<ExamItemCard item={makeItem()} onSelect={vi.fn()} />);

    expect(screen.getByText('Опишите принцип песчинки')).toBeInTheDocument();
    expect(screen.getByText(/Свободный ответ · Черновик/)).toBeInTheDocument();
  });

  it('без тегов — раздела с тегами нет', () => {
    render(<ExamItemCard item={makeItem({ tags: [] })} onSelect={vi.fn()} />);

    expect(screen.queryByText(/·.*·.*·/)).not.toBeInTheDocument();
  });

  it('с тегами — они перечислены через запятую', () => {
    render(<ExamItemCard item={makeItem({ tags: ['ян', 'база'] })} onSelect={vi.fn()} />);

    expect(screen.getByText(/ян, база/)).toBeInTheDocument();
  });

  it('version 1 — номер версии не показан', () => {
    render(<ExamItemCard item={makeItem({ version: 1 })} onSelect={vi.fn()} />);

    expect(screen.queryByText(/версия/)).not.toBeInTheDocument();
  });

  it('version больше 1 — номер версии показан', () => {
    render(<ExamItemCard item={makeItem({ version: 2 })} onSelect={vi.fn()} />);

    expect(screen.getByText(/версия 2/)).toBeInTheDocument();
  });

  it('клик по формулировке вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<ExamItemCard item={makeItem()} onSelect={onSelect} />);

    await userEvent.click(
      screen.getByRole('button', { name: /Опишите принцип песчинки/ }),
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('в строке ровно одно действие — открыть вопрос', () => {
    render(<ExamItemCard item={makeItem()} onSelect={vi.fn()} />);

    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
