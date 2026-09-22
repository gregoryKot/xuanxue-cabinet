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

describe('AttemptQuestionChoice — картинка варианта (ADR-0035)', () => {
  it('вариант без текста, с картинкой — radio находится по имени «Вариант N», картинка со своим src/alt', () => {
    const options: AttemptOptionDto[] = [
      { id: 'o1', text: '', imageId: 'img1' },
      { id: 'o2', text: 'Влево' },
    ];
    render(
      <>
        <span id={PROMPT_ID}>Куда уходит вес?</span>
        <AttemptQuestionChoice
          labelledBy={PROMPT_ID}
          itemId="i1"
          kind="single"
          options={options}
          selected={[]}
          onChange={vi.fn()}
        />
      </>,
    );

    expect(screen.getByRole('radio', { name: 'Вариант 1' })).toBeInTheDocument();
    const image = screen.getByAltText('Вариант 1');
    expect(image).toHaveAttribute('src', '/api/exam-images/img1');
  });

  // Отзыв владельца 2026-09-19: «при выборе картинок зачем писать вариант 1
  // вариант два?» — подпись стояла прямо над самой картинкой. Боту и
  // скринридеру она нужна (см. shared/src/exam-option-label.ts), глазам нет.
  it('подпись «Вариант N» у варианта-картинки не видна, но остаётся именем контрола', () => {
    const options: AttemptOptionDto[] = [
      { id: 'o1', text: '', imageId: 'img1' },
      { id: 'o2', text: 'Влево' },
    ];
    render(
      <>
        <span id={PROMPT_ID}>Куда уходит вес?</span>
        <AttemptQuestionChoice
          labelledBy={PROMPT_ID}
          itemId="i1"
          kind="single"
          options={options}
          selected={[]}
          onChange={vi.fn()}
        />
      </>,
    );

    expect(screen.getByText('Вариант 1')).toHaveClass('xuanxue-sr-only');
    // У варианта со своим текстом подпись видно как обычно.
    expect(screen.getByText('Влево')).not.toHaveClass('xuanxue-sr-only');
  });

  it('вариант без картинки — <img> не рендерится', () => {
    renderChoice('single', []);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('AttemptQuestionChoice — плитки вместо строк (docs/adr/0105)', () => {
  it('у картинки есть хоть один вариант — выбор плитки отдаёт id этого варианта', async () => {
    const options: AttemptOptionDto[] = [
      { id: 'o1', text: '', imageId: 'img1' },
      { id: 'o2', text: '', imageId: 'img2' },
    ];
    const onChange = vi.fn();
    render(
      <>
        <span id={PROMPT_ID}>Куда уходит вес?</span>
        <AttemptQuestionChoice
          labelledBy={PROMPT_ID}
          itemId="i1"
          kind="single"
          options={options}
          selected={[]}
          onChange={onChange}
        />
      </>,
    );

    await userEvent.click(screen.getByRole('radio', { name: 'Вариант 2' }));

    expect(onChange).toHaveBeenCalledWith(['o2']);
  });

  it('картинка есть у одного варианта, у второго только текст — оба плитки, каждый находится по своей роли и имени', () => {
    const options: AttemptOptionDto[] = [
      { id: 'o1', text: '', imageId: 'img1' },
      { id: 'o2', text: 'Влево' },
    ];
    render(
      <>
        <span id={PROMPT_ID}>Куда уходит вес?</span>
        <AttemptQuestionChoice
          labelledBy={PROMPT_ID}
          itemId="i1"
          kind="single"
          options={options}
          selected={[]}
          onChange={vi.fn()}
        />
      </>,
    );

    // Смешивать строку Toggle и плитку в одном вопросе не стали — раз есть
    // картинка хоть у одного варианта, группа целиком переходит на плитки.
    expect(screen.getByRole('radiogroup', { name: 'Куда уходит вес?' })).toHaveClass(
      'xuanxue-option-tiles',
    );
    expect(screen.getByRole('radio', { name: 'Вариант 1' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Влево' })).toBeInTheDocument();
  });

  it('вопрос без картинок остаётся строками Toggle — группа без класса плиток', () => {
    renderChoice('single', []);

    expect(screen.getByRole('radiogroup', { name: 'Куда уходит вес?' })).not.toHaveClass(
      'xuanxue-option-tiles',
    );
  });
});
