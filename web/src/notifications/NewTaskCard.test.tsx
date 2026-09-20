// Карточка нового задания в центре уведомлений — название, рубрика и переход
// на «Задания» (ADR-0065).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { NewTaskCard } from './NewTaskCard';

function makeExam(overrides: Partial<MyExamDto> = {}): MyExamDto {
  return {
    id: 'e1',
    title: 'Форма первого уровня',
    description: '',
    level: '',
    attemptsAllowed: 1,
    attemptsUsed: 0,
    ...overrides,
  };
}

function renderCard(exam: MyExamDto) {
  return render(
    <MemoryRouter>
      <ul>
        <NewTaskCard exam={exam} />
      </ul>
    </MemoryRouter>,
  );
}

describe('NewTaskCard', () => {
  it('название и рубрика видны', () => {
    renderCard(makeExam());

    expect(screen.getByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Новое задание')).toBeInTheDocument();
  });

  it('ссылка ведёт на «Задания»', () => {
    renderCard(makeExam());

    expect(screen.getByRole('link', { name: /Форма первого уровня/ })).toHaveAttribute(
      'href',
      '/tasks',
    );
  });
});
