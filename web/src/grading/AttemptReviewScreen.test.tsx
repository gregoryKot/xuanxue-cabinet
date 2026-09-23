// «Карточка» проверки целиком — критерии и ответ ученика видны, отправка
// оценки шлёт правильное тело запроса, ошибка сервера показывается (ТЗ 4.6).
// Экран теперь читает useAuth() (кнопка «Прислать мне в Telegram» смотрит на
// botChatActive) — рендер обязан идти под <AuthProvider>, а мок сети обязан
// отвечать и на /auth/me, не только на /attempts (тот же приём, что
// attempt/AttemptScreen.test.tsx). renderAt поэтому сам собирает конверт
// mockApiByPath из /auth/me по умолчанию и хендлеров теста — раньше тесты
// звали mockApiByPath/mockedApiFetch сами перед renderAt, но с двумя
// параллельными запросами при монтировании очередь `…Once` не гарантирует,
// какой ответ достанется какому (см. комментарий test-support/apiFetchMock.ts
// про a155bc1).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { AttemptReviewDto, MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import AttemptReviewScreen from './AttemptReviewScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Учитель с активным чатом с ботом — по умолчанию: тестам ниже, которым
// botChatActive не важен, нечего лишний раз объяснять про кнопку «Прислать
// мне в Telegram» (её собственное поведение — AttemptReviewMedia.test.tsx).
const TEACHER: MeDto = {
  id: 't1',
  name: 'Дима',
  roles: ['teacher'],
  status: 'active',
  telegramLinked: true,
  botChatActive: true,
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
};

function makeReview(overrides: Partial<AttemptReviewDto> = {}): AttemptReviewDto {
  return {
    attemptId: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    userName: 'Иван Иванов',
    status: 'submitted',
    // По умолчанию — прежнее поведение экрана до ADR-0102 (строка про
    // Telegram видна); тесты этого файла, которым важен противоположный
    // случай, переопределяют явно.
    notifiesUserInTelegram: true,
    blocks: [
      {
        id: 'b1',
        title: 'Теория',
        questions: [
          {
            itemId: 'q1',
            kind: 'text',
            prompt: 'Опишите дыхание',
            answerText: 'Дышу животом, ровно',
            options: [],
            answered: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** `handlers` — конверт mockApiByPath для запроса карточки (и всего, что
 * тест шлёт при монтировании); `/auth/me` подставляется сам, если тест его
 * не переопределил явно. */
function renderAt(
  attemptId: string,
  handlers: Record<string, unknown>,
  me: MeDto = TEACHER,
) {
  mockApiByPath({ '/auth/me': me, ...handlers });
  return render(
    <MemoryRouter initialEntries={[`/grading/${attemptId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/grading" element={<p>Очередь проверки</p>} />
          <Route path="/grading/:attemptId" element={<AttemptReviewScreen />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AttemptReviewScreen — загрузка', () => {
  it('показывает скелетон, пока карточка не пришла', () => {
    const { container } = renderAt('a1', { '/attempts': new Promise(() => {}) });

    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('AttemptReviewScreen — сбой загрузки', () => {
  it('ApiError — текст ошибки и кнопка повтора', async () => {
    renderAt('a1', {
      '/attempts': new ApiError(
        'Работа не найдена. Обновите страницу.',
        404,
        'not_found',
      ),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Работа не найдена. Обновите страницу.',
    );
  });
});

describe('AttemptReviewScreen — повтор и путь без id', () => {
  it('«Попробовать ещё раз» повторяет запрос карточки', async () => {
    const user = userEvent.setup();
    renderAt('a1', {
      '/attempts': new ApiError('Сеть подвела', 500, 'internal_error'),
    });
    await screen.findByRole('alert');
    mockApiByPath({ '/attempts': makeReview() });

    await user.click(screen.getByRole('button', { name: /ещё раз/i }));

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  // Маршрут без :attemptId в кабинете не встречается, но компонент не должен
  // падать на `undefined` в пути — хук получает пустую строку и показывает
  // баннер, а не белый экран.
  it('путь без id — баннер вместо падения', async () => {
    mockApiByPath({
      '/auth/me': TEACHER,
      '/attempts': new ApiError('Работа не найдена', 404, 'not_found'),
    });

    render(
      <MemoryRouter initialEntries={['/grading/']}>
        <AuthProvider>
          <Routes>
            <Route path="/grading/" element={<AttemptReviewScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — нет данных без ошибки сети', () => {
  // Список своих попыток у /attempts/:id/review нет — возможен только один
  // GET, но защитная ветка на случай пустого ответа без ApiError не должна
  // падать: баннер с пустым текстом, не белый экран.
  it('ответ без review и без ошибки — баннер без падения', async () => {
    renderAt('a1', { '/attempts': undefined });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — карточка', () => {
  it('видны формулировка вопроса и ответ ученика', async () => {
    renderAt('a1', { '/attempts': makeReview() });

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.getByText('Иван Иванов')).toBeInTheDocument();
    expect(screen.getByText('Дышу животом, ровно')).toBeInTheDocument();
  });

  it('вопрос с вариантами — виден верный и выбранный ученика', async () => {
    renderAt('a1', {
      '/attempts': makeReview({
        blocks: [
          {
            id: 'b1',
            title: 'Теория',
            questions: [
              {
                itemId: 'q2',
                kind: 'single',
                prompt: 'Сколько стоек в форме?',
                options: [
                  { id: 'o1', text: 'Три', correct: true, selected: false },
                  { id: 'o2', text: 'Пять', correct: false, selected: true },
                ],
                answered: true,
                optionsCheck: {
                  correctSelectedCount: 0,
                  correctTotalCount: 1,
                  incorrectSelectedCount: 1,
                },
              },
            ],
          },
        ],
      }),
    });

    const correctOption = await screen.findByText('Три');
    expect(correctOption.closest('li')).toHaveTextContent('Три — верный');
    const selectedOption = screen.getByText('Пять');
    expect(selectedOption.closest('li')).toHaveTextContent('Пять · выбрал ученик');
    expect(screen.getByText(/Выбрано верно 0 из 1, ещё 1 лишний/)).toBeInTheDocument();
  });

  it('оценка уже стоит — ответ сервера открывает форму заполненной', async () => {
    renderAt('a1', {
      '/attempts': makeReview({
        grading: {
          id: 'g1',
          attemptId: 'a1',
          examId: 'e1',
          userId: 'u1',
          graderId: 't1',
          comment: 'Проверьте дыхание',
          outcome: 'needs_work',
          gradedAt: '2026-01-01T00:00:00Z',
        },
      }),
    });

    expect(await screen.findByLabelText('Комментарий')).toHaveValue('Проверьте дыхание');
    expect(screen.getByLabelText('Итог')).toHaveValue('needs_work');
    expect(screen.getByRole('button', { name: 'Переписать оценку' })).toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — куда уйдёт итог (отзыв владельца 2026-09-21, ADR-0102)', () => {
  it('у ученика активный Telegram — видна строка про Telegram', async () => {
    renderAt('a1', {
      '/attempts': makeReview({ notifiesUserInTelegram: true }),
    });

    // «Telegram» выделено через RichText (<strong>, ADR-0124) — ищем по
    // хвосту фразы вне маркера, полный текст сверяем через textContent
    // родителя.
    const hint = await screen.findByText(/сразу после отправки/);
    expect(hint.closest('p')).toHaveTextContent(
      'Итог и комментарий уйдут ученику в Telegram сразу после отправки.',
    );
  });

  it('у ученика нет Telegram — видна строка про «Задания», строки про Telegram нет', async () => {
    renderAt('a1', {
      '/attempts': makeReview({ notifiesUserInTelegram: false }),
    });

    const hint = await screen.findByText(/не уйдут/);
    expect(hint.closest('p')).toHaveTextContent(
      'Итог и комментарий в Telegram не уйдут — ученик увидит их в кабинете, на «Заданиях».',
    );
    expect(screen.queryByText(/сразу после отправки/)).not.toBeInTheDocument();
  });
});

describe('AttemptReviewScreen — отправка оценки', () => {
  it('заполненная форма — PUT с правильным телом, карточка обновляется из его ответа (ADR-0087)', async () => {
    const user = userEvent.setup();
    renderAt('a1', { '/attempts': makeReview() });
    await screen.findByText('Форма первого уровня');

    await user.type(screen.getByLabelText('Комментарий'), 'Хорошо сдал');
    await user.selectOptions(screen.getByLabelText('Итог'), 'passed');

    // PUT отвечает карточкой проверки целиком (AttemptReviewDto) — второго
    // GET /attempts/a1/review за обновлённым статусом больше нет.
    mockApiByPath({
      '/attempts/a1/grading': makeReview({
        status: 'graded',
        grading: {
          id: 'g1',
          attemptId: 'a1',
          examId: 'e1',
          userId: 'u1',
          graderId: 't1',
          comment: 'Хорошо сдал',
          outcome: 'passed',
          gradedAt: '2026-01-01T00:00:00Z',
        },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/grading', {
      method: 'PUT',
      body: {
        comment: 'Хорошо сдал',
        outcome: 'passed',
      },
    });
    expect(
      await screen.findByRole('button', { name: 'Переписать оценку' }),
    ).toBeInTheDocument();
  });

  it('сбой сервера — сообщение под формой', async () => {
    const user = userEvent.setup();
    renderAt('a1', { '/attempts': makeReview() });
    await screen.findByText('Форма первого уровня');

    await user.selectOptions(screen.getByLabelText('Итог'), 'passed');

    mockApiByPath({
      '/attempts/a1/grading': new ApiError(
        'Эту работу ещё нельзя проверить: ученик её не сдал.',
        400,
        'invalid_input',
      ),
      '/attempts/a1/review': makeReview(),
    });
    await user.click(screen.getByRole('button', { name: 'Сохранить оценку' }));

    expect(
      await screen.findByText('Эту работу ещё нельзя проверить: ученик её не сдал.'),
    ).toBeInTheDocument();
  });
});

const VIDEO_QUESTION_BLOCKS = [
  {
    id: 'b2',
    title: 'Практика',
    questions: [
      {
        itemId: 'q2',
        kind: 'video' as const,
        prompt: 'Снимите форму «пэнбу»',
        options: [],
        answered: false,
      },
    ],
  },
];

describe('AttemptReviewScreen — видео у своего вопроса (ADR-0023, ADR-0037)', () => {
  it('видео-вопрос без видео — кнопка ручной отметки шлёт POST с itemId и перечитывает карточку', async () => {
    const user = userEvent.setup();
    renderAt('a1', { '/attempts': makeReview({ blocks: VIDEO_QUESTION_BLOCKS }) });
    await screen.findByText('Видео пока не получено.');

    // Ответы на клик — по пути (см. mockApiByPath в test-support): очередь
    // `…Once` здесь забирала форма оценки своими заготовками, и reload
    // получал карточку без видео — тест мигал (CI на main, a155bc1).
    mockApiByPath({
      '/attempts/a1/media/manual': undefined,
      '/attempts/a1/review': makeReview({
        blocks: VIDEO_QUESTION_BLOCKS,
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q2',
            kind: 'manual',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Отметить, что видео принято' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/manual', {
      method: 'POST',
      body: { itemId: 'q2' },
    });
    expect(await screen.findByText('Есть ответ')).toBeInTheDocument();
    expect(await screen.findByText('Отмечено вручную, без подписи.')).toBeInTheDocument();
  });

  it('видео своего вопроса получено по ссылке — метка «Есть ответ» и кликабельная ссылка у вопроса', async () => {
    renderAt('a1', {
      '/attempts': makeReview({
        blocks: VIDEO_QUESTION_BLOCKS,
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q2',
            kind: 'link',
            url: 'https://example.com/v',
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });

    expect(await screen.findByText('Есть ответ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://example.com/v' })).toHaveAttribute(
      'href',
      'https://example.com/v',
    );
  });

  it('видео без itemId (деплой на стыке версий) — отдельный блок «Видео без вопроса», не теряется', async () => {
    renderAt('a1', {
      '/attempts': makeReview({
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            kind: 'telegram',
            durationSec: 12,
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });

    expect(
      await screen.findByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
    // Не «видео смотрите там же» — карточка больше не обещает, что запись
    // уже в чате учителя (examMediaSourceText.ts).
    expect(screen.getByText('Прислано сообщением боту в Telegram.')).toBeInTheDocument();
  });

  // Сквозной сценарий четвёртого способа (доп. к ADR-0023) — своё поведение
  // кнопки/состояний покрыто в AttemptReviewMedia.test.tsx; здесь только
  // подтверждение, что она доезжает до экрана и шлёт запрос по attemptId.
  it('активный чат с ботом — «Прислать мне в Telegram» шлёт POST на send-to-me', async () => {
    const user = userEvent.setup();
    renderAt(
      'a1',
      {
        '/attempts': makeReview({
          media: [
            {
              id: 'm1',
              attemptId: 'a1',
              kind: 'telegram',
              durationSec: 12,
              receivedAt: '2026-09-12T00:00:00Z',
            },
          ],
        }),
      },
      TEACHER,
    );
    await screen.findByRole('heading', { name: 'Видео без вопроса' });
    mockApiByPath({ '/attempts/a1/media/m1/send-to-me': undefined });

    await user.click(screen.getByRole('button', { name: 'Прислать мне в Telegram' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/media/m1/send-to-me', {
      method: 'POST',
    });
    expect(
      await screen.findByText('Видео в чате с ботом — откройте Telegram.'),
    ).toBeInTheDocument();
  });

  // noTelegram: true — иначе showsTelegramOffer(me) предложил бы связку
  // (TelegramLinkButton), и на месте кнопки была бы её собственная строка,
  // а не эта (обе ветки разобраны отдельно в AttemptReviewMedia.test.tsx).
  // /auth/me и /attempts/:id/review — два независимых запроса; если карточка
  // пришла раньше сессии, video собирается с me === null (useAuth() ещё не
  // ответил) — `me?.botChatActive ?? false` не должен упасть на этом кадре.
  it('карточка пришла раньше сессии — без кнопки, без падения', async () => {
    mockApiByPath({
      '/auth/me': new Promise(() => {}),
      '/attempts': makeReview({
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            kind: 'telegram',
            durationSec: 12,
            receivedAt: '2026-09-12T00:00:00Z',
          },
        ],
      }),
    });
    render(
      <MemoryRouter initialEntries={['/grading/a1']}>
        <AuthProvider>
          <Routes>
            <Route path="/grading/:attemptId" element={<AttemptReviewScreen />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Видео без вопроса' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
  });

  it('нет активного чата с ботом — кнопки нет, есть объяснение', async () => {
    renderAt(
      'a1',
      {
        '/attempts': makeReview({
          media: [
            {
              id: 'm1',
              attemptId: 'a1',
              kind: 'telegram',
              durationSec: 12,
              receivedAt: '2026-09-12T00:00:00Z',
            },
          ],
        }),
      },
      { ...TEACHER, botChatActive: false, noTelegram: true },
    );
    await screen.findByRole('heading', { name: 'Видео без вопроса' });

    expect(
      screen.queryByRole('button', { name: 'Прислать мне в Telegram' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Бот пришлёт видео, когда у вас будет открыт чат с ним.'),
    ).toBeInTheDocument();
  });
});

// Снимок владельца с телефона: экран сливался с бумагой, ссылка возврата
// тянула подчёркивание во всю ширину, длинное имя вылезало за край
// (docs/adr/0043, ТЗ переоблика). jsdom не вычисляет `var(--…)` — сравниваем
// ровно строку инлайн-стиля, не вычисленный цвет.
describe('AttemptReviewScreen — облик (снимок владельца, ADR-0043)', () => {
  it('рубрика над именем есть, длинное имя-почта переносится, а не обрезается', async () => {
    renderAt('a1', {
      '/attempts': makeReview({ userName: 'doctor.martynova@gmail.com' }),
    });

    expect(await screen.findByText('Работа ученика')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('doctor.martynova@gmail.com');
    expect(heading.style.overflowWrap).toBe('anywhere');
  });

  it('ссылка возврата к очереди — по содержимому, не растянута на всю ширину', async () => {
    renderAt('a1', { '/attempts': makeReview() });
    await screen.findByText('Форма первого уровня');

    const backLink = screen.getByRole('link', { name: 'Вернуться к очереди проверки' });
    expect(backLink.style.alignSelf).toBe('flex-start');
  });

  it('карточка ответов и карточка проверки — с фоном var(--card)', async () => {
    const { container } = renderAt('a1', { '/attempts': makeReview() });
    await screen.findByText('Форма первого уровня');

    const cards = Array.from(
      container.querySelectorAll<HTMLElement>('div, aside'),
    ).filter((el) => el.style.background === 'var(--card)');
    expect(cards).toHaveLength(2);
  });
});
