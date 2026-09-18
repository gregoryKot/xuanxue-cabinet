import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { GradingQueueCard } from './GradingQueueCard';

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    submittedAt: '2026-09-01T01:00:00Z',
    expired: false,
    ...overrides,
  };
}

describe('GradingQueueCard', () => {
  it('показывает имя ученика, экзамен и когда сдана', () => {
    render(<GradingQueueCard attempt={makeAttempt()} onSelect={vi.fn()} />);

    expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
    expect(screen.getByText(/Форма первого уровня/)).toBeInTheDocument();
    expect(screen.getByText(/сдано/)).toBeInTheDocument();
  });

  it('аккаунт ученика удалён (userName не пришёл) — честная заглушка', () => {
    render(
      <GradingQueueCard
        attempt={makeAttempt({ userName: undefined })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('Аккаунт удалён')).toBeInTheDocument();
  });

  it('без даты сдачи — мета без «сдано»', () => {
    render(
      <GradingQueueCard
        attempt={makeAttempt({ submittedAt: undefined })}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.queryByText(/сдано/)).not.toBeInTheDocument();
  });

  it('сдано в срок — без пометки «по времени»', () => {
    render(
      <GradingQueueCard attempt={makeAttempt({ expired: false })} onSelect={vi.fn()} />,
    );

    expect(screen.queryByText(/по времени/)).not.toBeInTheDocument();
  });

  it('сдано по времени — пометка на карточке', () => {
    render(
      <GradingQueueCard attempt={makeAttempt({ expired: true })} onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/сдано по времени/)).toBeInTheDocument();
  });

  it('клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<GradingQueueCard attempt={makeAttempt()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  // Список — одна карточка (GradingQueueScreen.tsx, docs/adr/0043): строки
  // разделяет волосяная линия, у последней её быть не должно — иначе под
  // линией останется голая полоска фона. Та же правка, что у «Вопросов» и
  // «Каналов» по отзыву владельца (снимок со швами между карточками).
  it('последняя строка — без нижней волосяной линии, у остальных линия есть', () => {
    render(
      <ul>
        <GradingQueueCard
          attempt={makeAttempt({ id: 'a1', userName: 'Первый ученик' })}
          onSelect={vi.fn()}
        />
        <GradingQueueCard
          attempt={makeAttempt({ id: 'a2', userName: 'Второй ученик' })}
          onSelect={vi.fn()}
          isLast
        />
      </ul>,
    );

    const firstRow = screen.getByText('Первый ученик').closest('li');
    const lastRow = screen.getByText('Второй ученик').closest('li');

    expect(firstRow?.style.borderBottom).toBe('1px solid var(--panel)');
    // jsdom не раскладывает `border-bottom` с var() в цвете на длинные
    // свойства, а геттер шорт-формы для borderBottom: 'none' отдаёт «medium»
    // (баг cssstyle) — сравниваем длинную форму, её jsdom выставляет верно.
    expect(lastRow?.style.borderBottomStyle).toBe('none');
  });

  // Общую карточку рисует список, не строка — своя заливка на кнопке
  // выглядела бы рамкой поверх общей карточки.
  it('строка не несёт свой фон — карточку рисует список, а не кнопка', () => {
    render(<GradingQueueCard attempt={makeAttempt()} onSelect={vi.fn()} />);

    expect(screen.getByRole('button').style.background).toBe('transparent');
  });
});
