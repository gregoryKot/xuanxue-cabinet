import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttemptReviewBlockDto } from '@xuanxue/shared';
import { AttemptReviewAnswers } from './AttemptReviewAnswers';
import type { AttemptReviewVideoControls } from './useAttemptReviewMedia';

const BLOCKS: AttemptReviewBlockDto[] = [
  {
    id: 'b1',
    title: 'Теория',
    questions: [
      {
        itemId: 'q1',
        kind: 'text',
        prompt: 'Опишите дыхание',
        options: [],
        answered: false,
      },
    ],
  },
];

function makeVideo(
  overrides: Partial<AttemptReviewVideoControls> = {},
): AttemptReviewVideoControls {
  return {
    media: [],
    markMediaManual: () => Promise.resolve(true),
    markMediaStateFor: () => ({ pending: false, error: null }),
    sendMediaToMe: () => Promise.resolve(true),
    sendMediaStateFor: () => ({ pending: false, error: null, sent: false }),
    botChatActive: true,
    offersTelegramLink: false,
    ...overrides,
  };
}

describe('AttemptReviewAnswers', () => {
  it('заголовок, счётчик вопросов и вопросы блока — на экране; без видео блока видео нет вовсе', () => {
    render(<AttemptReviewAnswers blocks={BLOCKS} video={makeVideo()} />);

    expect(screen.getByRole('heading', { name: 'Ответы' })).toBeInTheDocument();
    // Вопрос фикстуры без ответа — счётчик честно говорит об этом
    // (отзыв владельца 2026-09-21).
    expect(
      screen.getByText('1 вопрос · 1 без ответа · все проверяете вы'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Опишите дыхание/)).toBeInTheDocument();
    // Блок без видео-вопросов и без «бесхозного» видео — блока «Видео» нет
    // вовсе (он переехал внутрь карточки видео-вопроса, ADR-0037).
    expect(screen.queryByText('Видео пока не получено.')).not.toBeInTheDocument();
  });

  // Без вопроса запись приходит по старой ссылке в бота, ручной отметкой и
  // на стыке деплоя (ADR-0037) — во всех случаях она обязана быть видна.
  it('видео без itemId — отдельный блок «Видео без вопроса» с пояснением', () => {
    render(
      <AttemptReviewAnswers
        blocks={BLOCKS}
        video={makeVideo({
          media: [
            {
              id: 'm1',
              attemptId: 'a1',
              kind: 'manual',
              note: 'Прислал в WhatsApp',
              receivedAt: '2026-09-12T00:00:00Z',
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Посмотрите и учтите её при оценке/)).toBeInTheDocument();
    expect(screen.getByText('Отмечено вручную: Прислал в WhatsApp')).toBeInTheDocument();
  });

  it('itemId указывает на вопрос без вариантов видео (не kind: video) — тоже «без вопроса», не пропадает', () => {
    render(
      <AttemptReviewAnswers
        blocks={BLOCKS}
        video={makeVideo({
          // BLOCKS.q1 — текстовый вопрос: видео не могло быть его ответом
          // (ADR-0037), поэтому запись всё равно уходит в «без вопроса».
          media: [
            {
              id: 'm1',
              attemptId: 'a1',
              itemId: 'q1',
              kind: 'manual',
              note: 'На всякий случай',
              receivedAt: '2026-09-12T00:00:00Z',
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Отмечено вручную: На всякий случай')).toBeInTheDocument();
  });
});

const VIDEO_BLOCKS: AttemptReviewBlockDto[] = [
  {
    id: 'b2',
    title: 'Практика',
    questions: [
      {
        itemId: 'v1',
        kind: 'video',
        prompt: 'Снимите стойку',
        options: [],
        answered: false,
      },
      {
        itemId: 'v2',
        kind: 'video',
        prompt: 'Снимите шаг',
        options: [],
        answered: false,
      },
    ],
  },
];

describe('AttemptReviewAnswers — видео под своим вопросом (ADR-0037, сквозной сценарий)', () => {
  it('видео первого вопроса не показывается у второго и не попадает в «без вопроса»', () => {
    render(
      <AttemptReviewAnswers
        blocks={VIDEO_BLOCKS}
        video={makeVideo({
          media: [
            {
              id: 'm1',
              attemptId: 'a1',
              itemId: 'v1',
              kind: 'link',
              url: 'https://example.com/v1',
              receivedAt: '2026-09-12T00:00:00Z',
            },
          ],
        })}
      />,
    );

    // Заголовка «без вопроса» нет вовсе — запись нашла свой вопрос.
    expect(
      screen.queryByRole('heading', { name: 'Видео без вопроса' }),
    ).not.toBeInTheDocument();

    const questionRows = screen.getAllByText(/Снимите/).map((el) => el.closest('div'));
    expect(questionRows[0]).toHaveTextContent('Есть ответ');
    expect(questionRows[1]).toHaveTextContent('Ответа нет');
    expect(screen.getByRole('link', { name: 'Открыть ссылку на видео' })).toHaveAttribute(
      'href',
      'https://example.com/v1',
    );
  });
});
