import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptReviewQuestionDto } from '@xuanxue/shared';
import { AttemptReviewQuestion } from './AttemptReviewQuestion';
import type { AttemptReviewVideoControls } from './useAttemptReviewMedia';

// По умолчанию — вопрос без ответа: у базовой формы (options: []) ни
// answerText, ни selected нет, так что честный default — answered: false, а
// не «true везде, лишь бы собралось» (CLAUDE.md). Тесты, которым нужен
// отвеченный вопрос, выставляют answered: true рядом с answerText/selected.
function makeQuestion(
  overrides: Partial<AttemptReviewQuestionDto> = {},
): AttemptReviewQuestionDto {
  return {
    itemId: 'q1',
    kind: 'text',
    prompt: 'Опишите дыхание',
    options: [],
    answered: false,
    ...overrides,
  };
}

function makeVideo(
  overrides: Partial<AttemptReviewVideoControls> = {},
): AttemptReviewVideoControls {
  return {
    media: [],
    pendingItemIds: [],
    markMediaManual: () => Promise.resolve(true),
    markMediaStateFor: () => ({ pending: false, error: null }),
    sendMediaToMe: () => Promise.resolve(true),
    sendMediaStateFor: () => ({ pending: false, error: null, sent: false }),
    botChatActive: true,
    offersTelegramLink: false,
    ...overrides,
  };
}

describe('AttemptReviewQuestion — текстовый вопрос', () => {
  it('есть ответ — виден как есть', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: 'Дышу животом', answered: true })}
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

    expect(screen.getByText('Ответа нет.')).toBeInTheDocument();
  });

  it('пустая строка ответа — тоже «Ответа нет»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: '   ' })}
      />,
    );

    expect(screen.getByText('Ответа нет.')).toBeInTheDocument();
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
          answered: true,
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
          answered: true,
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
          answered: true,
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

  it('вариант с видео (ADR-0133) — миниатюра плеера перед подписью', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          answered: true,
          options: [
            { id: 'o1', text: '', correct: true, selected: true, videoId: 'vid1' },
          ],
        })}
      />,
    );

    expect(document.querySelector('video')).toHaveAttribute(
      'src',
      '/api/exam-videos/vid1',
    );
  });

  it('вариант без картинки — миниатюра не рендерится', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          answered: true,
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
          answered: true,
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

  // Регрессия отзыва владельца 2026-09-21: у неотвеченного вопроса печаталось
  // «Выбрано верно 0 из 3» — неотличимо от честно неверного ответа.
  it('без ответа — «Ответа нет.» и метка «Не отвечено», без «Выбрано верно»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          answered: false,
          options: [
            { id: 'o1', text: 'Три', correct: true, selected: false },
            { id: 'o2', text: 'Пять', correct: false, selected: false },
          ],
        })}
      />,
    );

    expect(screen.getByText('Ответа нет.')).toBeInTheDocument();
    expect(screen.getByText('Не отвечено')).toBeInTheDocument();
    expect(screen.queryByText(/Выбрано верно/)).not.toBeInTheDocument();
  });
});

// ADR-0146: у вопроса с askReason answerText — объяснение выбора, не
// альтернативный ответ (в отличие от текстового вопроса выше).
describe('AttemptReviewQuestion — объяснение выбора (ADR-0146)', () => {
  it('askReason, вариант выбран, объяснение написано — подпись и текст под вариантами', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          askReason: true,
          answered: true,
          answerText: 'Потому что так короче',
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.getByText('Объяснение ученика')).toBeInTheDocument();
    expect(screen.getByText('Потому что так короче')).toBeInTheDocument();
  });

  it('askReason, вариант выбран, объяснения нет (дедлайн) — «Объяснения нет.»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          askReason: true,
          answered: true,
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.getByText('Объяснения нет.')).toBeInTheDocument();
  });

  it('askReason, вопрос вообще без ответа — «Объяснения нет.» не дублирует «Ответа нет.»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          askReason: true,
          answered: false,
          options: [{ id: 'o1', text: 'Три', correct: true, selected: false }],
        })}
      />,
    );

    expect(screen.getByText('Ответа нет.')).toBeInTheDocument();
    expect(screen.queryByText('Объяснения нет.')).not.toBeInTheDocument();
  });

  it('askReason выключен, объяснения не писали — ни подписи, ни «Объяснения нет»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          answered: true,
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.queryByText('Объяснение ученика')).not.toBeInTheDocument();
    expect(screen.queryByText('Объяснения нет.')).not.toBeInTheDocument();
  });

  it('askReason выключен, но текст в ответе есть — всё равно показан как объяснение', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({
          kind: 'single',
          answered: true,
          answerText: 'Старая попытка до включения флага',
          options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        })}
      />,
    );

    expect(screen.getByText('Объяснение ученика')).toBeInTheDocument();
    expect(screen.getByText('Старая попытка до включения флага')).toBeInTheDocument();
  });

  it('вопрос без вариантов — объяснение не рендерится (нечего объяснять, текст уже сам ответ)', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: 'Дышу животом', answered: true })}
      />,
    );

    expect(screen.queryByText('Объяснение ученика')).not.toBeInTheDocument();
  });
});

describe('AttemptReviewQuestion — вопрос без вариантов', () => {
  it('метка «Смотрите вы» — машина текст не проверяет', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        video={makeVideo()}
        question={makeQuestion({ answerText: 'Дышу через живот', answered: true })}
      />,
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

  // Аудит 2026-10-01 F34: учитель ставил «доработать», пока видео ещё шло.
  it('видео этого вопроса ещё грузится — метка и текст «загружается», не «ответа нет»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ kind: 'video' })}
        video={makeVideo({ pendingItemIds: ['q1'] })}
      />,
    );

    expect(screen.getByText('Видео загружается')).toBeInTheDocument();
    expect(screen.getByText('Видео загружается — подождите.')).toBeInTheDocument();
    expect(screen.queryByText('Ответа нет')).not.toBeInTheDocument();
  });

  it('грузится видео другого вопроса — у этого по-прежнему «Ответа нет»', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({ kind: 'video' })}
        video={makeVideo({ pendingItemIds: ['q2'] })}
      />,
    );

    expect(screen.getByText('Ответа нет')).toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: 'https://example.com/v' })).toHaveAttribute(
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

describe('AttemptReviewQuestion — видео формулировки (ADR-0133)', () => {
  it('videoUrl вопроса — плеер ссылки виден рядом с вариантами', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({
          kind: 'single',
          videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
          options: [{ id: 'o1', text: 'A', correct: true, selected: false }],
        })}
        video={makeVideo()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Смотреть здесь' })).toBeInTheDocument();
  });

  it('без видео у вопроса — плеера нет', () => {
    render(
      <AttemptReviewQuestion
        index={0}
        question={makeQuestion({
          kind: 'single',
          options: [{ id: 'o1', text: 'A', correct: true, selected: false }],
        })}
        video={makeVideo()}
      />,
    );

    expect(
      screen.queryByRole('button', { name: 'Смотреть здесь' }),
    ).not.toBeInTheDocument();
  });
});
