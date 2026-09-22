// Сборка экрана /attempts/:id — выбор состояния по ответу GET /attempts
// (своего GET /attempts/:id у API нет, useAttempt.ts берёт список и находит
// по id). Форма ответа и «Отправлено» — свои тесты в AttemptInProgress.test.tsx
// и AttemptSubmitted.test.tsx, здесь только маршрутизация между ними.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExamAttemptDto, ExamMediaDto, MeDto } from '@xuanxue/shared';
import { ATTEMPTS_LIST_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import AttemptScreen from './AttemptScreen';
import { ATTEMPT_VIDEO_POLL_INTERVAL_MS } from './useAttemptVideoPoll';

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
  status: 'active',
  telegramLinked: true,
  botChatActive: true,
  noTelegram: false,
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

/** Сколько раз апи звали ровно по адресу списка попыток — не по `/submit`
 * или `/media/link`, у них свои пути. Считает случившиеся загрузки попытки:
 * монтирование, reload() и фоновый refresh() опроса (useAttemptVideoPoll.ts). */
function attemptsListCallCount(): number {
  return mockedApiFetch.mock.calls.filter(([path]) => path === ATTEMPTS_LIST_PATH).length;
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
      await screen.findByText(
        'Отправлено. Учитель проверит — результат будет на карточке экзамена в кабинете.',
      ),
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
    // useExpiryNotice.ts: попытка пришла закрытой уже на первом ответе сервера
    // — экран её «в работе» не застал, попап поверх «Отправлено» не нужен,
    // текст экрана уже сказал то же самое.
    expect(screen.queryByRole('dialog', { name: 'Время вышло' })).not.toBeInTheDocument();
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

  // ADR-0067 обещает, что отметка «у меня нет Telegram» гасит предложение на
  // всех экранах сразу. Видео-вопрос оставался последним местом, где кабинет
  // звал отметившегося в Telegram: условие показа было своё
  // (`!telegramLinked`), мимо общего предиката.
  it('отметка «у меня нет Telegram» — связку не предлагаем, форма ссылки остаётся', async () => {
    mockPaths([{ ...IN_PROGRESS, status: 'submitted' }], {
      ...STUDENT_WITH_TELEGRAM,
      telegramLinked: false,
      botChatActive: false,
      noTelegram: true,
    });
    renderAt('a1');

    expect(await screen.findByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
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
    expect(await screen.findByText('Вы прислали ссылку')).toBeInTheDocument();
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

// Отзыв владельца 2026-09-21: попап «Время вышло» — только тому, у кого
// дедлайн настиг попытку прямо на этом сеансе (useExpiryNotice.ts). Триггер —
// автоматическая перезагрузка попытки, которую AttemptDeadlineTimer.tsx
// вызывает сама, когда локальный отсчёт уже в прошлом (никакого клика не
// нужно, а значит и никакой гонки с моментом, когда он случится).
// Аудит 2026-09-21, HIGH «потеря последнего ответа ученика»: `submit()`
// (useAttempt.ts) слал POST /submit не дожидаясь PATCH /answers — выбор
// варианта в последний момент терял ответ (гонка PATCH/POST, сервер отвечал
// «попытка уже не in_progress», exam-attempt-save.ts) или улетал в пустоту
// вовсе (debounce 2 с не успевал). Чинит AttemptInProgress.tsx: перед
// onSubmit зовёт `await autosave.flush()`. На старом коде (submit без
// ожидания flush) первый тест ниже упал бы — POST ушёл бы раньше, чем
// PATCH получил ответ.
describe('AttemptScreen — отправка ждёт сохранения (аудит 2026-09-21)', () => {
  const CHOICE_ATTEMPT: ExamAttemptDto = {
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
            itemId: 'q1',
            version: 1,
            kind: 'single',
            prompt: 'Сколько стоек в форме?',
            options: [
              { id: 'o1', text: 'Три' },
              { id: 'o2', text: 'Пять' },
            ],
          },
        ],
      },
    ],
    answers: [],
    startedAt: '2026-09-01T00:00:00Z',
    expired: false,
  };

  async function confirmSubmit(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    const dialog = screen.getByRole('dialog', { name: 'Отправить экзамен?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));
  }

  it('выбор варианта → сразу «Отправить» — PATCH долетает раньше POST submit', async () => {
    const calls: string[] = [];
    let resolvePatch: (() => void) | undefined;
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT_WITH_TELEGRAM);
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotUsername: 'xx_bot' });
      if (path === '/attempts/a1/answers' && init?.method === 'PATCH') {
        calls.push('PATCH');
        return new Promise<void>((resolve) => {
          resolvePatch = resolve;
        });
      }
      if (path === '/attempts/a1/submit' && init?.method === 'POST') {
        calls.push('POST');
        return Promise.resolve({ ...CHOICE_ATTEMPT, status: 'submitted' });
      }
      if (path.startsWith('/attempts')) return Promise.resolve([CHOICE_ATTEMPT]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    renderAt('a1');
    const user = userEvent.setup();

    // Выбор варианта — changeOptions флашит сразу (AttemptQuestion.tsx), PATCH
    // уже ушёл, но сервер ещё не ответил.
    await user.click(await screen.findByRole('radio', { name: 'Пять' }));
    expect(calls).toEqual(['PATCH']);

    // «Отправить» сразу же, пока PATCH висит без ответа.
    await confirmSubmit(user);
    expect(calls).toEqual(['PATCH']);

    resolvePatch?.();
    await waitFor(() => expect(calls).toEqual(['PATCH', 'POST']));
  });

  it('PATCH упал — POST submit не уходит, на экране текст об ошибке сохранения', async () => {
    let submitCalled = false;
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT_WITH_TELEGRAM);
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotUsername: 'xx_bot' });
      if (path === '/attempts/a1/answers' && init?.method === 'PATCH') {
        return Promise.reject(new Error('сеть недоступна'));
      }
      if (path === '/attempts/a1/submit' && init?.method === 'POST') {
        submitCalled = true;
        return Promise.resolve({ ...CHOICE_ATTEMPT, status: 'submitted' });
      }
      if (path.startsWith('/attempts')) return Promise.resolve([CHOICE_ATTEMPT]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    renderAt('a1');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('radio', { name: 'Пять' }));
    await confirmSubmit(user);

    expect(
      await screen.findByText(
        'Не удалось сохранить последний ответ. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(submitCalled).toBe(false);
    // ConfirmDialog закрывает себя после onConfirm независимо от исхода
    // (её же комментарий-шапка) — дожидаемся закрытия, иначе кнопка
    // «Отправить» под подвалом формы и в уже закрывающемся диалоге временно
    // совпадают, и запрос неоднозначен.
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Отправить экзамен?' }),
      ).not.toBeInTheDocument(),
    );
    // Форма осталась открытой — попытка не отправлена.
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
  });
});

describe('AttemptScreen — попап «Время вышло»', () => {
  it('попытка была в работе, сервер закрыл её по дедлайну — показывается попап поверх «Отправлено»', async () => {
    let attemptsCallCount = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT_WITH_TELEGRAM);
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotUsername: 'xx_bot' });
      if (path.startsWith('/attempts')) {
        attemptsCallCount += 1;
        // Первый ответ — попытка ещё в работе, но с дедлайном в прошлом:
        // AttemptDeadlineTimer.tsx это застаёт сразу при монтировании и сам
        // просит попытку перечитать (её же комментарий-шапка).
        return Promise.resolve([
          attemptsCallCount === 1
            ? { ...IN_PROGRESS, deadlineAt: new Date(Date.now() - 1000).toISOString() }
            : { ...IN_PROGRESS, status: 'submitted', expired: true },
        ]);
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    renderAt('a1');

    expect(
      await screen.findByRole('dialog', { name: 'Время вышло' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Попытка закрыта и ушла учителю на проверку. Ответы, которые вы успели дать, сохранены.',
      ),
    ).toBeInTheDocument();
    // Попап — поверх экрана «Отправлено», не вместо него (AttemptScreen.tsx:
    // сервер уже переключил статус, попап — лишь одноразовое уведомление).
    expect(
      screen.getByText('Время вышло, попытка закрыта и отправлена на проверку.'),
    ).toBeInTheDocument();
  });

  it('«Закрыть» закрывает попап и он не возвращается', async () => {
    let attemptsCallCount = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT_WITH_TELEGRAM);
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotUsername: 'xx_bot' });
      if (path.startsWith('/attempts')) {
        attemptsCallCount += 1;
        return Promise.resolve([
          attemptsCallCount === 1
            ? { ...IN_PROGRESS, deadlineAt: new Date(Date.now() - 1000).toISOString() }
            : { ...IN_PROGRESS, status: 'submitted', expired: true },
        ]);
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    renderAt('a1');
    const user = userEvent.setup();

    const dialog = await screen.findByRole('dialog', { name: 'Время вышло' });
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }));

    expect(screen.queryByRole('dialog', { name: 'Время вышло' })).not.toBeInTheDocument();
  });
});

// Баг из жалобы: ученик отправляет видео боту в Telegram, бот принимает и
// сохраняет его, но открытая вкладка кабинета не знала об этом — экран
// оставался с формой «пришлите запись» до ручной перезагрузки. Нарушение
// Read-after-write (CLAUDE.md); чинит useAttemptVideoPoll.ts (ADR-0076).
// Фейковые таймеры — детерминизм (CLAUDE.md): тик тестируется по
// ATTEMPT_VIDEO_POLL_INTERVAL_MS, не по настоящим 15 секундам.
describe('AttemptScreen — опрос видео из Telegram', () => {
  const RECEIVED_MEDIA: ExamMediaDto = {
    id: 'm1',
    attemptId: 'a1',
    itemId: 'q3',
    kind: 'telegram',
    receivedAt: '2026-09-12T16:30:00.000Z',
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('видео-вопрос без ответа — через ATTEMPT_VIDEO_POLL_INTERVAL_MS сервер уже отвечает с media, отметка появляется без перезагрузки', async () => {
    // Ответ меняется между вызовами тем же приёмом, что в тесте на
    // сохранение ссылки выше: первый GET отдаёт попытку без видео, тик
    // опроса — уже с ним, как будто бот принял сообщение между ними.
    let currentAttempt: unknown = IN_PROGRESS;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT_WITH_TELEGRAM);
      if (path === '/auth/config')
        return Promise.resolve({ telegramBotUsername: 'xx_bot' });
      if (path.startsWith('/attempts')) return Promise.resolve([currentAttempt]);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderAt('a1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
    expect(screen.queryByText(/Вы прислали/)).not.toBeInTheDocument();

    currentAttempt = { ...IN_PROGRESS, media: [RECEIVED_MEDIA] };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTEMPT_VIDEO_POLL_INTERVAL_MS);
    });

    // Форма сдачи остаётся (статус попытки не менялся) — отметка появляется
    // прямо в ней, ученику не нужно ничего нажимать или перезагружать.
    expect(screen.getByText(/Вы прислали/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
  });

  it.each([
    ['видео уже получено', { ...IN_PROGRESS, media: [RECEIVED_MEDIA] }],
    ['у попытки нет видео-вопросов', { ...IN_PROGRESS, blocks: [] }],
  ])('%s — тик не делает лишних запросов к /attempts', async (_label, attempt) => {
    mockPaths([attempt]);
    renderAt('a1');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsBefore = attemptsListCallCount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ATTEMPT_VIDEO_POLL_INTERVAL_MS * 3);
    });

    expect(attemptsListCallCount()).toBe(callsBefore);
  });
});
