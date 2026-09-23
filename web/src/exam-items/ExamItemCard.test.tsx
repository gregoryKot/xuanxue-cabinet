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

  // Список вопросов — одна карточка (docs/adr/0043): волосяную линию между
  // строками красит сама строка, а не контейнер, поэтому у последней строки
  // её быть не должно — иначе под линией останется голая полоска фона.
  it('последняя строка — без нижней волосяной линии, у остальных линия есть', () => {
    render(
      <ul>
        <ExamItemCard
          item={makeItem({ id: 'e1', prompt: 'Первый вопрос' })}
          onSelect={vi.fn()}
        />
        <ExamItemCard
          item={makeItem({ id: 'e2', prompt: 'Второй вопрос' })}
          onSelect={vi.fn()}
          isLast
        />
      </ul>,
    );

    const firstRow = screen.getByText('Первый вопрос').closest('li');
    const lastRow = screen.getByText('Второй вопрос').closest('li');

    expect(firstRow?.style.borderBottom).toBe('1px solid var(--panel)');
    // jsdom не раскладывает `border-bottom` с var() в цвете на длинные
    // свойства, а геттер шорт-формы для borderBottom: 'none' отдаёт «medium»
    // (баг cssstyle) — сравниваем длинную форму, её jsdom выставляет верно.
    expect(lastRow?.style.borderBottomStyle).toBe('none');
  });

  // Общую карточку рисует список (ExamItemsScreen.tsx), не строка — своя
  // заливка на кнопке выглядела бы рамкой поверх общей карточки.
  it('строка не несёт свой фон — карточку рисует список, а не кнопка', () => {
    render(<ExamItemCard item={makeItem()} onSelect={vi.fn()} />);

    expect(screen.getByRole('button').style.background).toBe('transparent');
  });
});
