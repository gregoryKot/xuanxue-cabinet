// Сборка экрана /attempts/:id — выбор состояния по ответу GET /attempts
// (своего GET /attempts/:id у API нет, useAttempt.ts берёт список и находит
// по id). Форма ответа и «Отправлено» — свои тесты в AttemptInProgress.test.tsx
// и AttemptSubmitted.test.tsx, здесь только маршрутизация между ними.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, ExamMediaDto, MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import AttemptScreen from './AttemptScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const STUDENT_WITH_TELEGRAM: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: true,
  botChatActive: true,
  hasEmail: true,
  needsProfile: false,
};

/** Экран параллельно зовёт /attempts, /auth/me и /auth/config, поэтому мок —
 * по пути, а не очередью `mockResolvedValueOnce`: очередь отдала бы ответ
 * тому, кто успел первым, и тест держался бы на порядке эффектов. */
function mockPaths(attempts: unknown, me: MeDto = STUDENT_WITH_TELEGRAM) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config')
      return Promise.resolve({ telegramBotUsername: 'xx_bot' });
    if (path.startsWith('/attempts')) {
      return attempts instanceof Error
        ? Promise.reject(attempts)
        : Promise.resolve(attempts);
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

function renderAt(attemptId: string) {
  return render(
    <MemoryRouter initialEntries={[`/attempts/${attemptId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/attempts/:id" element={<AttemptScreen />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// Блок с одним видео-вопросом — ADR-0037: у экрана есть кнопка бота и на
// форме сдачи, и на «Отправлено», и обе должны вести на этот вопрос, не на
// попытку целиком.
const IN_PROGRESS: ExamAttemptDto = {
  id: 'a1',
  examId: 'e1',
  examTitle: 'Форма первого уровня',
  userId: 'u1',
  status: 'in_progress',
  blocks: [
    {
      id: 'b1',
      title: '',
      questions: [
        {
          itemId: 'q3',
          version: 1,
          kind: 'video',
          prompt: 'Покажите форму',
          options: [],
        },
      ],
    },
  ],
  answers: [],
  startedAt: '2026-09-01T00:00:00Z',
  expired: false,
};

describe('AttemptScreen', () => {
  it('в работе — рисует форму сдачи с названием экзамена', async () => {
    mockPaths([IN_PROGRESS]);
    renderAt('a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
  });

  it('в работе — у видео-вопроса есть кнопка бота с deep link на вопрос', async () => {
    mockPaths([IN_PROGRESS]);
    renderAt('a1');

    expect(
      await screen.findByRole('link', { name: 'Отправить видео боту в Telegram' }),
    ).toHaveAttribute('href', 'https://t.me/xx_bot?start=exam_a1_q3');
  });

  it('уже отправлена — экран «Отправлено», без формы', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }]);
    renderAt('a1');

    expect(
      await screen.findByText('Отправлено. Учитель проверит и пришлёт результат.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
  });

  // PLAN.md §11 «Лимит времени считается на сервере»: экран переключается на
  // «Отправлено» только по статусу из ответа сервера. Часы телефона, что
  // спешат (дедлайн «уже прошёл» локально, сервер держит in_progress), — форма
  // остаётся; часы, что отстают (локально «ещё есть время», сервер уже закрыл
  // попытку), — «Отправлено» без ожидания местного отсчёта.
  it('дедлайн прошёл по часам телефона, но сервер говорит in_progress — форма сдачи, не «Отправлено»', async () => {
    mockPaths([
      { ...IN_PROGRESS, deadlineAt: new Date(Date.now() - 60_000).toISOString() },
    ]);
    renderAt('a1');

    expect(await screen.findByRole('button', { name: 'Отправить' })).toBeInTheDocument();
    expect(
      screen.queryByText('Время вышло, попытка закрыта и отправлена на проверку.'),
    ).not.toBeInTheDocument();
  });

  it('по часам телефона время ещё есть, но сервер уже закрыл попытку — «время вышло», без формы', async () => {
    mockPaths([
      {
        ...IN_PROGRESS,
        status: 'submitted',
        expired: true,
        deadlineAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    ]);
    renderAt('a1');

    expect(
      await screen.findByText('Время вышло, попытка закрыта и отправлена на проверку.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument();
  });

  // Инцидент 2026-09-16 (RUNBOOK §8.17): вошедший по почте видел кнопку
  // «Отправить видео боту», шёл по ней и получал от бота отказ.
  it('Telegram не привязан — на «Отправлено» кнопки бота нет, есть форма ссылки', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }], {
      ...STUDENT_WITH_TELEGRAM,
      telegramLinked: false,
      botChatActive: false,
    });
    renderAt('a1');

    expect(await screen.findByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Отправить видео боту/ }),
    ).not.toBeInTheDocument();
  });

  it('Telegram привязан — на «Отправлено» есть кнопка бота с deep link на вопрос', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }]);
    renderAt('a1');

    expect(
      await screen.findByRole('link', { name: 'Отправить видео боту в Telegram' }),
    ).toHaveAttribute('href', 'https://t.me/xx_bot?start=exam_a1_q3');
  });

  // Read-after-write (CLAUDE.md): сохранили ссылку — сразу видим её на
  // экране, не только по факту успешного запроса.
  it('на «Отправлено» сохранение ссылки перечитывает попытку и показывает «Видео получено»', async () => {
    const url = 'https://example.com/v';
    let submittedAttempt: unknown = { ...IN_PROGRESS, status: 'submitted' };
    mockedApiFetch.mockImplementation(
      (path: string, init?: { method?: string; body?: unknown }) => {
        if (path === '/auth/me') return Promise.resolve(STUDENT_WITH_TELEGRAM);
        if (path === '/auth/config')
          return Promise.resolve({ telegramBotUsername: 'xx_bot' });
        if (path === '/attempts/a1/media/link' && init?.method === 'POST') {
          const media: ExamMediaDto = {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q3',
            kind: 'link',
            url,
            receivedAt: '2026-09-12T16:30:00.000Z',
          };
          submittedAttempt = { ...IN_PROGRESS, status: 'submitted', media: [media] };
          return Promise.resolve(undefined);
        }
        if (path.startsWith('/attempts')) return Promise.resolve([submittedAttempt]);
        return Promise.reject(new Error(`неожиданный путь: ${path}`));
      },
    );
    renderAt('a1');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Ссылка на видео'), url);
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/link', {
      method: 'POST',
      body: { url, itemId: 'q3' },
    });
    expect(await screen.findByText(/Видео получено/)).toBeInTheDocument();
  });

  it('сбой сети — баннер с повтором', async () => {
    mockPaths(new ApiError('Нет связи с сервером.', 0, 'network'));
    renderAt('a1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером.');
  });

  it('после сбоя «Повторить» перечитывает попытку и открывает форму', async () => {
    let attemptsCallCount = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/attempts')) {
        attemptsCallCount += 1;
        return attemptsCallCount === 1
          ? Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'))
          : Promise.resolve([IN_PROGRESS]);
      }
      return Promise.resolve({});
    });
    renderAt('a1');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  // Маршрут без :id руками не собрать, но React Router может отдать undefined —
  // экран не должен падать, а должен честно сказать, что попытки нет.
  it('без идентификатора в адресе — «попытка не найдена», без падения', async () => {
    mockPaths([IN_PROGRESS]);
    render(
      <MemoryRouter initialEntries={['/attempts']}>
        <AuthProvider>
          <Routes>
            <Route path="/attempts" element={<AttemptScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попытка не найдена. Обновите страницу.',
    );
  });

  it('такой попытки нет в списке своих — текст «попытка не найдена»', async () => {
    mockPaths([]);
    renderAt('чужая-или-неизвестная');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Попытка не найдена. Обновите страницу.',
    );
  });
});
