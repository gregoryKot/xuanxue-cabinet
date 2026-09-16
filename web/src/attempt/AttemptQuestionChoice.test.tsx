// Снятие галочки — отдельная ветка `toggle` (вернуть пустой выбор у «single»,
// вычесть из списка у «multiple»): её легко потерять, потому что вручную
// проверяют обычно только «выбрал». Формулировка вопроса рядом — она подпись
// группы вариантов (`aria-labelledby`, AttemptQuestion.tsx), и без неё у
// группы не было бы имени.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptOptionDto } from '@xuanxue/shared';
import { AttemptQuestionChoice } from './AttemptQuestionChoice';

const OPTIONS: AttemptOptionDto[] = [
  { id: 'o1', text: 'Вправо' },
  { id: 'o2', text: 'Влево' },
];

const PROMPT_ID = 'prompt-i1';

function renderChoice(kind: 'single' | 'multiple', selected: string[]) {
  const onChange = vi.fn();
  render(
    <>
      <span id={PROMPT_ID}>Куда уходит вес?</span>
      <AttemptQuestionChoice
        labelledBy={PROMPT_ID}
        itemId="i1"
        kind={kind}
        options={OPTIONS}
        selected={selected}
        onChange={onChange}
      />
    </>,
  );
  return onChange;
}

describe('AttemptQuestionChoice', () => {
  it('группу вариантов подписывает сама формулировка вопроса', () => {
    renderChoice('single', []);

    expect(
      screen.getByRole('radiogroup', { name: 'Куда уходит вес?' }),
    ).toBeInTheDocument();
  });

  it('один вариант: выбор заменяет прежний', async () => {
    const onChange = renderChoice('single', ['o1']);

    await userEvent.click(screen.getByRole('radio', { name: 'Влево' }));

    expect(onChange).toHaveBeenCalledWith(['o2']);
  });

  it('несколько вариантов: второй добавляется к первому', async () => {
    const onChange = renderChoice('multiple', ['o1']);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Влево' }));

    expect(onChange).toHaveBeenCalledWith(['o1', 'o2']);
  });

  it('несколько вариантов: снятая галочка убирает свой вариант, остальные остаются', async () => {
    const onChange = renderChoice('multiple', ['o1', 'o2']);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Вправо' }));

    expect(onChange).toHaveBeenCalledWith(['o2']);
  });
});
