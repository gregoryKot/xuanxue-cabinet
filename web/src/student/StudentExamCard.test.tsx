import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MyExamDto } from '@xuanxue/shared';
import { StudentExamCard } from './StudentExamCard';

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

describe('StudentExamCard', () => {
  it('попытки не было — кнопка «Начать»', () => {
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error={null}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Осталось 1 попытка')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Начать' })).toBeInTheDocument();
  });

  it('попытка в работе — кнопка «Продолжить»', () => {
    const exam = makeExam({ lastAttempt: { id: 'a1', status: 'in_progress' } });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeInTheDocument();
  });

  it('последняя попытка отправлена — без кнопки, честная строка', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted' },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
  });

  it('клик по кнопке зовёт onStart', () => {
    const onStart = vi.fn();
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error={null}
        onStart={onStart}
      />,
    );

    screen.getByRole('button', { name: 'Начать' }).click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('описание формы, если учитель его заполнил', () => {
    const exam = makeExam({ description: 'Форма стойки и базовые связки.' });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByText('Форма стойки и базовые связки.')).toBeInTheDocument();
  });

  it('ошибка старта попытки видна рядом с кнопкой', () => {
    render(
      <StudentExamCard
        exam={makeExam()}
        pending={false}
        error="Нет связи с сервером."
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Нет связи с сервером.');
  });

  it('работа проверена — вместо кнопки итог и комментарий учителя', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'graded',
        outcome: 'needs_work',
        comment: 'Проверьте стойку в начале формы.',
      },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Нужно доработать')).toBeInTheDocument();
    expect(screen.getByText(/Проверьте стойку в начале формы\./)).toBeInTheDocument();
    expect(screen.queryByText('Экзамен проверен')).not.toBeInTheDocument();
  });

  // Слой 4.7: «нужно доработать» без кнопки — тупик. Попытка ещё есть —
  // значит, ученик может пройти заново прямо с этой карточки.
  it('работу вернули на доработку, попытка осталась — кнопка «Пройти ещё раз» рядом с итогом', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    const exam = makeExam({
      attemptsAllowed: 2,
      attemptsUsed: 1,
      lastAttempt: {
        id: 'a1',
        status: 'graded',
        outcome: 'needs_work',
        comment: 'Проверьте стойку в начале формы.',
      },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={onStart} />,
    );

    expect(screen.getByText('Нужно доработать')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Пройти ещё раз' }));

    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('работа отправлена, но ещё не проверена — оценки и итога нет', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'submitted' },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByText('Отправлено, ждём проверки')).toBeInTheDocument();
    expect(screen.queryByText(/из \d+$/)).not.toBeInTheDocument();
  });

  it('помечено проверенным, но оценка ещё не пришла — запасной текст, не «мусор»', () => {
    const exam = makeExam({
      attemptsAllowed: 1,
      attemptsUsed: 1,
      lastAttempt: { id: 'a1', status: 'graded' },
    });
    render(
      <StudentExamCard exam={exam} pending={false} error={null} onStart={vi.fn()} />,
    );

    expect(screen.getByText('Экзамен проверен')).toBeInTheDocument();
  });
});
