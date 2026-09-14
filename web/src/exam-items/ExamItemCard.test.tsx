import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamItemDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { ExamItemCard } from './ExamItemCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

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
    expect(screen.getByText(/Текстовый ответ · Черновик/)).toBeInTheDocument();
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

  it('кнопка «Статистика» не вызывает onSelect', async () => {
    const onSelect = vi.fn();
    mockApiByPath({ '/exam-items': { itemId: 'e1', kind: 'text', askedCount: 0 } });
    render(<ExamItemCard item={makeItem()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: 'Статистика' }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('«Статистика» открывает и закрывает статистику вопроса', async () => {
    mockApiByPath({ '/exam-items': { itemId: 'e1', kind: 'text', askedCount: 0 } });
    render(<ExamItemCard item={makeItem()} onSelect={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Статистика' }));
    expect(
      await screen.findByText('Этот вопрос ещё никому не задавали.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Скрыть статистику' }));
    expect(
      screen.queryByText('Этот вопрос ещё никому не задавали.'),
    ).not.toBeInTheDocument();
  });
});
