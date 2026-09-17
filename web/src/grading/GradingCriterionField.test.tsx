import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GradingCriterionFieldState } from './gradingFormInput';
import { GradingCriterionField } from './GradingCriterionField';

function makeCriterion(
  overrides: Partial<GradingCriterionFieldState> = {},
): GradingCriterionFieldState {
  return {
    id: 'c1',
    title: 'Устойчивость',
    maxScore: 5,
    scoreText: '',
    comment: '',
    ...overrides,
  };
}

describe('GradingCriterionField', () => {
  it('описание критерия — подсказка под полем баллов', () => {
    render(
      <GradingCriterionField
        criterion={makeCriterion({ description: 'Вес переносится плавно' })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Вес переносится плавно')).toBeInTheDocument();
  });

  it('без описания — подсказки нет', () => {
    render(<GradingCriterionField criterion={makeCriterion()} onChange={vi.fn()} />);

    expect(screen.queryByText('Вес переносится плавно')).not.toBeInTheDocument();
  });

  it('правка баллов — onChange со scoreText, остальные поля как были', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<GradingCriterionField criterion={makeCriterion()} onChange={onChange} />);

    await user.type(screen.getByLabelText('Устойчивость — баллы (0–5)'), '4');

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'c1', scoreText: '4' }),
    );
  });

  // Поле управляемое: без родителя, который возвращает новое состояние
  // обратно в проп, каждый следующий символ затирал бы предыдущий. Поэтому
  // тут настоящая обвязка с useState, а не spy: проверяем то, что увидит
  // учитель, — накопленный текст в поле.
  it('правка комментария к критерию — текст накапливается в поле', async () => {
    const user = userEvent.setup();
    function Wrapper() {
      const [criterion, setCriterion] = useState(makeCriterion());
      return <GradingCriterionField criterion={criterion} onChange={setCriterion} />;
    }
    render(<Wrapper />);

    const field = screen.getByLabelText('Комментарий к «Устойчивость»');
    await user.type(field, 'Хорошо');

    expect(field).toHaveValue('Хорошо');
  });
});
