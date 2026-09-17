import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptReviewQuestionDto } from '@xuanxue/shared';
import { AttemptReviewQuestion } from './AttemptReviewQuestion';
import type { AttemptReviewVideoControls } from './useAttemptReview';

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

function makeVideo(
  overrides: Partial<AttemptReviewVideoControls> = {},
): AttemptReviewVideoControls {
  return {
    media: [],
    markMediaManual: () => Promise.resolve(true),
    markMediaStateFor: () => ({ pending: false, error: null }),
    ...overrides,
  };
}

describe('AttemptReviewQuestion — текстовый вопрос', () => {
  it('есть подсказка ученику — видна учителю', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ hint: 'Считайте по схеме' })}
      />,
    );

    expect(screen.getByText(/Подсказка ученику: Считайте по схеме/)).toBeInTheDocument();
  });

  it('без подсказки — строка не рисуется', () => {
    render(
      <AttemptReviewQuestion index={0} video={makeVideo()} question={makeQuestion()} />,
    );

    expect(screen.queryByText(/Подсказка ученику/)).not.toBeInTheDocument();
  });

  it('есть ответ — виден как есть', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: 'Дышу животом' })}
      />,
    );

    expect(screen.getByText('Дышу животом')).toBeInTheDocument();
  });

  it('ответа нет — честный текст, не пустота', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: undefined })}
      />,
    );

    expect(screen.getByText('Ответ не дан.')).toBeInTheDocument();
  });

  it('пустая строка ответа — тоже «Ответ не дан»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: '   ' })}
      />,
    );

    expect(screen.getByText('Ответ не дан.')).toBeInTheDocument();
  });
});

describe('AttemptReviewQuestion — вопрос с вариантами', () => {
  it('верный и выбранный вариант помечены раздельно', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
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
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.queryByText(/Выбрано верно/)).not.toBeInTheDocument();
  });

  it('вариант с картинкой (ADR-0035) — миниатюра перед подписью, с нужным src', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          options: [
            { id: 'o1', text: '', correct: true, selected: true, imageId: 'img1' },
          ],
        })}
      />,
    );

    expect(screen.getByText('Вариант 1').closest('li')).toHaveTextContent(
      'Вариант 1 — верный',
    );
    const image = screen.getByAltText('Вариант 1');
    expect(image).toHaveAttribute('src', '/api/exam-images/img1');
  });

  it('вариант без картинки — миниатюра не рендерится', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('автопроверка без ошибок — метка «Верно»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
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
  it('метка «Смотрите вы» — машина текст не проверяет', () => {
    render(
      <AttemptReviewQuestion index={0} video={makeVideo()} question={makeQuestion()} />,
    );

    expect(screen.getByText('Смотрите вы')).toBeInTheDocument();
  });
});

describe('AttemptReviewQuestion — видео-вопрос (ADR-0037, свой itemId)', () => {
  it('видео нет — метка «Ответа нет», кнопка ручной отметки шлёт itemId вопроса', async () => {
    const user = userEvent.setup();
    const markMediaManual = vi.fn().mockResolvedValue(true);
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ kind: 'video' })}
        video={makeVideo({ markMediaManual })}
      />,
    );

    expect(screen.getByText('Ответа нет')).toBeInTheDocument();
    expect(screen.getByText('Видео пока не получено.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отметить, что видео принято' }));

    expect(markMediaManual).toHaveBeenCalledWith('q1');
  });

  it('видео этого вопроса пришло — метка «Есть ответ», строка получения видна', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ kind: 'video' })}
        media={[
          {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q1',
            kind: 'link',
            url: 'https://example.com/v',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ]}
        video={makeVideo()}
      />,
    );

    expect(screen.getByText('Есть ответ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть ссылку на видео' })).toHaveAttribute(
      'href',
      'https://example.com/v',
    );
  });

  // Какое видео относится к какому вопросу — решает вызывающий,
  // attemptReviewMediaByQuestion.ts (свой юнит-тест) и сквозной сценарий
  // в AttemptReviewAnswers.test.tsx; сам вопрос лишь показывает, что ему дали
  // в `media`, поэтому здесь нечего фильтровать и нечего проверять отдельно.

  it('без heading — заголовка «Видео» в карточке нет, формулировка вопроса уже сказала, что это', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ kind: 'video' })}
        video={makeVideo()}
      />,
    );

    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
