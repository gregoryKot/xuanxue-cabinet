// Блок «Видео» на экране «Отправлено» — та же обвязка мока, что у
// AttemptQuestionVideo.test.tsx: AttemptQuestionVideo внутри зовёт
// TelegramLinkButton, а тот живёт в AuthProvider и ходит в /auth/me.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptBlockDto, ExamAttemptDto, ExamMediaDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { AttemptSubmittedVideos } from './AttemptSubmittedVideos';
import type { AttemptVideoControls } from './useAttemptMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

function makeBlock(overrides: Partial<AttemptBlockDto> = {}): AttemptBlockDto {
  return { id: 'b1', title: '', questions: [], ...overrides };
}

function makeAttempt(blocks: AttemptBlockDto[] = []): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'submitted',
    blocks,
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
  };
}

function makeVideo(overrides: Partial<AttemptVideoControls> = {}): AttemptVideoControls {
  return {
    attemptId: 'a1',
    media: [],
    telegramBotUsername: 'xuanxue_bot',
    telegramLinked: true,
    offersTelegramLink: false,
    canChangeAnswer: true,
    addMediaLink: vi.fn().mockResolvedValue(true),
    linkStateFor: () => ({ pending: false, error: null }),
    removeMedia: vi.fn().mockResolvedValue(true),
    removeStateFor: () => ({ pending: false, error: null }),
    ...overrides,
  };
}

function renderVideos(attempt: ExamAttemptDto, video: AttemptVideoControls) {
  mockApiByPath({ '/auth/me': new Promise(() => {}) });
  return render(
    <AuthProvider>
      <AttemptSubmittedVideos attempt={attempt} video={video} />
    </AuthProvider>,
  );
}

// Два видео-вопроса в разных блоках: q3 — третий вопрос первого блока
// (index 2), q5 — первый вопрос второго (index 0). Номер на «Отправлено»
// должен повторить тот, что ученик видел на форме сдачи.
const TWO_VIDEO_QUESTIONS: AttemptBlockDto[] = [
  makeBlock({
    id: 'b1',
    questions: [
      { itemId: 'q1', version: 1, kind: 'text', prompt: 'Опишите форму', options: [] },
      { itemId: 'q2', version: 1, kind: 'text', prompt: 'Опишите дыхание', options: [] },
      { itemId: 'q3', version: 1, kind: 'video', prompt: 'Покажите форму', options: [] },
    ],
  }),
  makeBlock({
    id: 'b2',
    questions: [
      { itemId: 'q5', version: 1, kind: 'video', prompt: 'Покажите толчок', options: [] },
    ],
  }),
];

describe('AttemptSubmittedVideos', () => {
  it('нет видео-вопросов и нет media — ничего не рендерит', () => {
    const { container } = renderVideos(makeAttempt([makeBlock()]), makeVideo());

    expect(container).toBeEmptyDOMElement();
  });

  it('два видео-вопроса в разных блоках — свой номер, формулировка и ссылка бота у каждого', () => {
    renderVideos(makeAttempt(TWO_VIDEO_QUESTIONS), makeVideo());

    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Покажите форму')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Покажите толчок')).toBeInTheDocument();

    const links = screen.getAllByRole('link', {
      name: 'Отправить видео боту в Telegram',
    });
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      'https://t.me/xuanxue_bot?start=exam_a1_q3',
      'https://t.me/xuanxue_bot?start=exam_a1_q5',
    ]);
  });

  it('видео получено у одного вопроса — у другого остаётся форма', () => {
    const received: ExamMediaDto = {
      id: 'm1',
      attemptId: 'a1',
      itemId: 'q3',
      kind: 'link',
      url: 'https://example.com/v',
      receivedAt: '2026-09-12T16:30:00.000Z',
    };
    renderVideos(makeAttempt(TWO_VIDEO_QUESTIONS), makeVideo({ media: [received] }));

    expect(screen.getByText(/Видео получено/)).toBeInTheDocument();
    expect(screen.getAllByLabelText('Ссылка на видео')).toHaveLength(1);
  });

  it('запись без itemId — строка «видео без вопроса»', () => {
    const orphan: ExamMediaDto = {
      id: 'm2',
      attemptId: 'a1',
      kind: 'link',
      url: 'https://example.com/v',
      receivedAt: '2026-09-12T16:30:00.000Z',
    };
    renderVideos(makeAttempt([makeBlock()]), makeVideo({ media: [orphan] }));

    expect(screen.getByText(/Видео без вопроса/)).toBeInTheDocument();
    expect(screen.getByText(/Видео получено/)).toBeInTheDocument();
  });
});

// Переезд на «Тёплую школу» (ADR-0043, владелец согласовал 2026-09-20):
// список видео-вопросов лёг в карточку, как разбор попытки у учителя
// (grading/AttemptReviewScreen.test.tsx). jsdom не вычисляет `var(--…)` —
// сравниваем ровно строку инлайн-стиля, не вычисленный цвет.
describe('AttemptSubmittedVideos — облик (ADR-0043)', () => {
  it('список видео-вопросов обёрнут в карточку с фоном var(--card)', () => {
    const { container } = renderVideos(makeAttempt(TWO_VIDEO_QUESTIONS), makeVideo());

    const cards = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      (el) => el.style.background === 'var(--card)',
    );
    expect(cards).toHaveLength(1);
  });

  // Без видео-вопросов карточке нечего обрамлять (только орфанная запись
  // ниже неё) — пустая карточка над ней читалась бы как сломанный макет.
  it('видео-вопросов нет, есть только запись без itemId — карточки нет', () => {
    const orphan: ExamMediaDto = {
      id: 'm2',
      attemptId: 'a1',
      kind: 'link',
      url: 'https://example.com/v',
      receivedAt: '2026-09-12T16:30:00.000Z',
    };
    const { container } = renderVideos(
      makeAttempt([makeBlock()]),
      makeVideo({ media: [orphan] }),
    );

    const cards = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      (el) => el.style.background === 'var(--card)',
    );
    expect(cards).toHaveLength(0);
  });
});
