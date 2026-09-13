import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ExamGradingDto, RubricCriterionDto } from '@xuanxue/shared';
import { GradingForm } from './GradingForm';

const RUBRIC: RubricCriterionDto[] = [
  { id: 'c1', title: 'Устойчивость', maxScore: 5 },
  { id: 'c2', title: 'Темп', maxScore: 3 },
];

function makeGrading(overrides: Partial<ExamGradingDto> = {}): ExamGradingDto {
  return {
    id: 'g1',
    attemptId: 'a1',
    examId: 'e1',
    userId: 'u1',
    graderId: 't1',
    criteria: [
      { id: 'c1', title: 'Устойчивость', maxScore: 5, score: 4 },
      { id: 'c2', title: 'Темп', maxScore: 3, score: 2 },
    ],
    outcome: 'passed',
    gradedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderForm(overrides: Partial<Parameters<typeof GradingForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(true);
  render(
    <GradingForm
      rubric={RUBRIC}
      grading={undefined}
      onSubmit={onSubmit}
      saving={false}
      saveError={null}
      {...overrides}
    />,
  );
  return { onSubmit };
}

describe('GradingForm — новая оценка', () => {
  it('поля пустые, кнопка «Сохранить оценку»', () => {
    renderForm();

    expect(screen.getByLabelText('Устойчивость — баллы (0–5)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Сохранить оценку' })).toBeInTheDocument();
  });

  it('отправка без баллов — валидная ошибка, onSubmit не звался', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Баллы по критерию «Устойчивость» — от 0 до 5.',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('баллы вне диапазона — ошибка называет критерий и границы', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Устойчивость — баллы (0–5)'), '9');
    await user.type(screen.getByLabelText('Темп — баллы (0–3)'), '2');
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Баллы по критерию «Устойчивость» — от 0 до 5.',
    );
  });

  it('баллы заполнены, итог не выбран — ошибка про итог', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Устойчивость — баллы (0–5)'), '4');
    await user.type(screen.getByLabelText('Темп — баллы (0–3)'), '2');
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите итог проверки.');
  });

  it('заполненная валидная форма — onSubmit с правильным телом запроса', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();

    await user.type(screen.getByLabelText('Устойчивость — баллы (0–5)'), '4');
    await user.type(screen.getByLabelText('Темп — баллы (0–3)'), '2');
    await user.type(screen.getByLabelText('Общий комментарий'), 'Хорошо сдал');
    await user.selectOptions(screen.getByLabelText('Итог'), 'passed');
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(onSubmit).toHaveBeenCalledWith({
      criteria: [
        { id: 'c1', score: 4, comment: undefined },
        { id: 'c2', score: 2, comment: undefined },
      ],
      comment: 'Хорошо сдал',
      outcome: 'passed',
    });
  });
});

describe('GradingForm — оценка уже стоит', () => {
  it('поля заполнены прежней оценкой, кнопка «Переписать оценку»', () => {
    renderForm({ grading: makeGrading() });

    expect(screen.getByLabelText('Устойчивость — баллы (0–5)')).toHaveValue('4');
    expect(screen.getByLabelText('Темп — баллы (0–3)')).toHaveValue('2');
    expect(screen.getByLabelText('Итог')).toHaveValue('passed');
    expect(screen.getByRole('button', { name: 'Переписать оценку' })).toBeInTheDocument();
  });
});

describe('GradingForm — ошибка сервера', () => {
  it('показывается под формой', () => {
    renderForm({ saveError: { message: 'Не удалось сохранить оценку.' } });

    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить оценку.');
  });
});
