import { render, screen } from '@testing-library/react';
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
});
