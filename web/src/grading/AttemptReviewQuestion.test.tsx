import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttemptReviewQuestionDto } from '@xuanxue/shared';
import { AttemptReviewQuestion } from './AttemptReviewQuestion';

function makeQuestion(
  overrides: Partial<AttemptReviewQuestionDto> = {},
): AttemptReviewQuestionDto {
  return {
    itemId: 'q1',
    kind: 'text',
    prompt: 'Опишите дыхание',
    options: [],
    ...overrides,
  };
}

describe('AttemptReviewQuestion — текстовый вопрос', () => {
  it('есть подсказка ученику — видна учителю', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ hint: 'Считайте по схеме' })}
      />,
    );

    expect(screen.getByText(/Подсказка ученику: Считайте по схеме/)).toBeInTheDocument();
  });

  it('без подсказки — строка не рисуется', () => {
    render(<AttemptReviewQuestion index={0} question={makeQuestion()} />);

    expect(screen.queryByText(/Подсказка ученику/)).not.toBeInTheDocument();
  });

  it('есть ответ — виден как есть', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ answerText: 'Дышу животом' })}
      />,
    );

    expect(screen.getByText('Дышу животом')).toBeInTheDocument();
  });

  it('ответа нет — честный текст, не пустота', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ answerText: undefined })}
      />,
    );

    expect(screen.getByText('Ответ не дан.')).toBeInTheDocument();
  });

  it('пустая строка ответа — тоже «Ответ не дан»', () => {
    render(
      <AttemptReviewQuestion index={0} question={makeQuestion({ answerText: '   ' })} />,
    );

    expect(screen.getByText('Ответ не дан.')).toBeInTheDocument();
  });
});

describe('AttemptReviewQuestion — вопрос с вариантами', () => {
  it('верный и выбранный вариант помечены раздельно', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({
          kind: 'single',
          options: [
            { id: 'o1', text: 'Три', correct: true, selected: false },
            { id: 'o2', text: 'Пять', correct: false, selected: true },
          ],
        })}
      />,
    );

    expect(screen.getByText('Три').closest('li')).toHaveTextContent('Три — верный');
    expect(screen.getByText('Пять').closest('li')).toHaveTextContent(
      'Пять · выбрал ученик',
    );
  });

  it('без счётчика автопроверки — строка не рисуется', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({
          kind: 'single',
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.queryByText(/Выбрано верно/)).not.toBeInTheDocument();
  });

  it('автопроверка без ошибок — метка «Верно»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({
          kind: 'single',
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
          optionsCheck: {
            correctSelectedCount: 1,
            correctTotalCount: 1,
            incorrectSelectedCount: 0,
          },
        })}
      />,
    );

    expect(screen.getByText('Верно')).toBeInTheDocument();
  });
});

describe('AttemptReviewQuestion — вопрос без вариантов', () => {
  it('метка «Смотрите вы» — машина текст/видео не проверяет', () => {
    render(<AttemptReviewQuestion index={0} question={makeQuestion()} />);

    expect(screen.getByText('Смотрите вы')).toBeInTheDocument();
  });
});
