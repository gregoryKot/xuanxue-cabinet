// Экран «Отправлено» зовёт useAuth() ради предложения связать Telegram,
// поэтому вокруг нужен AuthProvider, а он ходит в /auth/me (та же обвязка
// мока, что у AttemptSubmittedVideos.test.tsx).
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptBlockDto, ExamAttemptDto, MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AttemptSubmitted } from './AttemptSubmitted';
import type { AttemptVideoControls } from './useAttemptMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const OFFER_EXPLANATION = /бот напишет, как только учитель поставит итог/;
const VIDEO_EXPLANATION =
  /Свяжите Telegram — и видео можно будет прислать боту одним сообщением/;
const LINK_BUTTON_NAME = 'Связать Telegram';

/** Ученик без личного чата с ботом — тот, ради кого предложение и стоит. */
const STUDENT: MeDto = {
  id: 'u1',
  name: 'Иван',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
};

const VIDEO_BLOCKS: AttemptBlockDto[] = [
  {
    id: 'b1',
    title: '',
    questions: [
      { itemId: 'q1', version: 1, kind: 'video', prompt: 'Покажите форму', options: [] },
    ],
  },
];

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'submitted',
    blocks: [],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
    ...overrides,
  };
}

function makeVideo(overrides: Partial<AttemptVideoControls> = {}): AttemptVideoControls {
  return {
    attemptId: 'a1',
    media: [],
    telegramBotUsername: 'xuanxue_bot',
    telegramLinked: true,
    offersTelegramLink: false,
    acceptsAnswers: true,
    addMediaLink: vi.fn().mockResolvedValue(true),
    linkStateFor: () => ({ pending: false, error: null }),
    ...overrides,
  };
}

interface RenderOptions {
  me?: MeDto;
  video?: Partial<AttemptVideoControls>;
}

async function renderSubmitted(attempt: ExamAttemptDto, options: RenderOptions = {}) {
  mockApiByPath({ '/auth/me': options.me ?? STUDENT });
  const result = render(
    <MemoryRouter>
      <AuthProvider>
        <AttemptSubmitted attempt={attempt} video={makeVideo(options.video)} />
      </AuthProvider>
    </MemoryRouter>,
  );
  // AuthProvider читает /auth/me в эффекте. Без этого шага `me` остаётся
  // null, showsTelegramOffer молчит — и тест «кнопки нет» прошёл бы по
  // ложной причине, не заметив сломанного условия.
  await act(async () => {});
  return result;
}

describe('AttemptSubmitted', () => {
  it('шапка та же, что у формы сдачи: рубрика и название экзамена', async () => {
    await renderSubmitted(makeAttempt());

    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Форма первого уровня' }),
    ).toBeInTheDocument();
  });

  it('отправлено самим учеником — результат ждёт в кабинете, отправку не обещаем', async () => {
    await renderSubmitted(makeAttempt());

    expect(
      screen.getByText(
        'Отправлено. Учитель проверит — результат будет на карточке экзамена в кабинете.',
      ),
    ).toBeInTheDocument();
  });

  it('закрыто временем — отдельная честная строка', async () => {
    await renderSubmitted(makeAttempt({ expired: true }));

    expect(
      screen.getByText('Время вышло, попытка закрыта и отправлена на проверку.'),
    ).toBeInTheDocument();
  });

  it('проверено — на экране только статус, итог и комментарий живут в кабинете', async () => {
    await renderSubmitted(makeAttempt({ status: 'graded' }));

    expect(screen.getByText('Экзамен проверен.')).toBeInTheDocument();
  });

  it('ссылка возврата к экзаменам', async () => {
    await renderSubmitted(makeAttempt());

    expect(screen.getByRole('link', { name: 'Вернуться к экзаменам' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});

describe('AttemptSubmitted — предложение связать Telegram (ADR-0066)', () => {
  it('попытка без видео-вопросов, чата с ботом нет — кнопка и своя причина', async () => {
    await renderSubmitted(makeAttempt());

    expect(screen.getByRole('button', { name: LINK_BUTTON_NAME })).toBeInTheDocument();
    expect(screen.getByText(OFFER_EXPLANATION)).toBeInTheDocument();
  });

  it('чат с ботом активен — предлагать нечего', async () => {
    await renderSubmitted(makeAttempt(), { me: { ...STUDENT, botChatActive: true } });

    expect(
      screen.queryByRole('button', { name: LINK_BUTTON_NAME }),
    ).not.toBeInTheDocument();
  });

  it('есть видео-вопрос — кнопка одна, вопросная: две подряд с разными причинами читались бы как две связки', async () => {
    await renderSubmitted(makeAttempt({ blocks: VIDEO_BLOCKS }), {
      video: { telegramLinked: false, offersTelegramLink: true },
    });

    expect(screen.getAllByRole('button', { name: LINK_BUTTON_NAME })).toHaveLength(1);
    expect(screen.getByText(VIDEO_EXPLANATION)).toBeInTheDocument();
    expect(screen.queryByText(OFFER_EXPLANATION)).not.toBeInTheDocument();
  });
});
