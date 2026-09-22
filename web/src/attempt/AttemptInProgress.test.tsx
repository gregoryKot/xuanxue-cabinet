// Форма сдачи целиком (ТЗ п.2) — вопросы по типам, автосохранение реальным
// PATCH (детали дебаунса/повтора — useAttemptAutosave.test.ts), отправка с
// подтверждением, истёкший дедлайн.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  ATTEMPT_EXPIRED_MESSAGE,
  type ExamAttemptDto,
  type ExamMediaDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { AttemptInProgress } from './AttemptInProgress';
import type { AttemptVideoControls } from './useAttemptMedia';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Время получения видео читаем в фиксированном поясе зрителя (как
// AttemptQuestionVideo.test.tsx) — иначе строка «Видео получено …» плывёт
// вместе с поясом машины, на которой гоняют тесты.
stubViewerTimeZone();

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

function makeAttempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: 'a1',
    examId: 'e1',
    examTitle: 'Форма первого уровня',
    userId: 'u1',
    status: 'in_progress',
    blocks: [
      {
        id: 'b1',
        title: 'Теория',
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
          {
            itemId: 'q2',
            version: 1,
            kind: 'text',
            prompt: 'Опишите дыхание',
            options: [],
          },
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
    ...overrides,
  };
}

// Отвечено всё: вариант, текст и присланное видео (attemptUnanswered.ts) —
// тогда подтверждение отправки обычное, без разговора о пропусках. Фикстура
// нужна именно отвеченная там, где проверяют саму отправку: иначе форма
// сначала спросит про вопросы без ответа, и тест проверял бы другой путь.
const ALL_ANSWERED: Partial<ExamAttemptDto> = {
  answers: [
    { itemId: 'q1', optionIds: ['o1'] },
    { itemId: 'q2', text: 'Ровно и глубоко' },
  ],
};
const VIDEO_RECEIVED: ExamMediaDto[] = [
  {
    id: 'm1',
    attemptId: 'a1',
    itemId: 'q3',
    kind: 'telegram',
    receivedAt: '2026-09-12T16:30:00.000Z',
  },
];

function renderAnswered(overrides: Partial<ExamAttemptDto> = {}) {
  return renderAttempt(makeAttempt({ ...ALL_ANSWERED, ...overrides }), {
    video: makeVideo({ media: VIDEO_RECEIVED }),
  });
}

function renderAttempt(
  attempt: ExamAttemptDto,
  extra: Partial<Parameters<typeof AttemptInProgress>[0]> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const reload = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <MemoryRouter>
      <AttemptInProgress
        attempt={attempt}
        reload={reload}
        onSubmit={onSubmit}
        submitting={false}
        submitError={null}
        video={makeVideo()}
        {...extra}
      />
    </MemoryRouter>,
  );
  return { ...view, onSubmit, reload };
}

describe('AttemptInProgress — шапка', () => {
  it('рубрика «Экзамен» и название экзамена заголовком экрана', () => {
    renderAttempt(makeAttempt());

    expect(screen.getByText('Экзамен')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Форма первого уровня' }),
    ).toBeInTheDocument();
  });

  it('вопросы блока — по одной строке на вопрос внутри карточки', () => {
    renderAttempt(makeAttempt());

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Теория')).toBeInTheDocument();
  });
});

describe('AttemptInProgress — подсказка и оставшееся время', () => {
  it('у вопроса есть подсказка — она видна ученику (она для него и написана)', () => {
    const attempt = makeAttempt();
    const block = attempt.blocks[0];
    if (!block) throw new Error('в фикстуре должен быть блок');
    const question = block.questions[0];
    if (!question) throw new Error('в фикстуре должен быть вопрос');
    question.hint = 'Считайте по схеме из методички.';

    render(
      <MemoryRouter>
        <AttemptInProgress
          attempt={attempt}
          reload={() => Promise.resolve()}
          onSubmit={() => Promise.resolve()}
          submitting={false}
          submitError={null}
          video={makeVideo()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Считайте по схеме из методички.')).toBeInTheDocument();
  });

  it('лимит времени ещё не вышел — на экране видно, сколько осталось', () => {
    render(
      <MemoryRouter>
        <AttemptInProgress
          attempt={makeAttempt({
            deadlineAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          })}
          reload={() => Promise.resolve()}
          onSubmit={() => Promise.resolve()}
          submitting={false}
          submitError={null}
          video={makeVideo()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/осталось/i)).toBeInTheDocument();
  });

  // Форма без лимита времени не монтирует AttemptDeadlineTimer вовсе: иначе
  // его `useNow` будил бы React раз в секунду там, где считать нечего, — а
  // экзамен идут сдавать с телефона (CLAUDE.md «Мобильный экран первым»).
  it('форма без лимита времени — отсчёта на экране нет', () => {
    render(
      <MemoryRouter>
        <AttemptInProgress
          attempt={makeAttempt({ deadlineAt: undefined })}
          reload={() => Promise.resolve()}
          onSubmit={() => Promise.resolve()}
          submitting={false}
          submitError={null}
          video={makeVideo()}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/осталось/i)).not.toBeInTheDocument();
  });
});

// ADR-0093: учитель вставляет ссылку на видео прямо в текст вопроса вместо
// отдельного поля — кабинет находит её сам и показывает кликабельной, тем же
// PromptText.tsx, что и в предпросмотре (exams/ExamPreviewQuestion.test.tsx).
describe('AttemptInProgress — ссылка в формулировке (ADR-0093)', () => {
  it('ссылка на видео в тексте вопроса кликабельна на экране сдачи', () => {
    const attempt = makeAttempt();
    const block = attempt.blocks[0];
    if (!block) throw new Error('в фикстуре должен быть блок');
    const question = block.questions[1];
    if (!question) throw new Error('в фикстуре должен быть вопрос');
    question.prompt = 'Посмотрите демонстрацию https://youtu.be/demo и повторите';

    renderAttempt(attempt);

    const link = screen.getByRole('link', { name: 'https://youtu.be/demo' });
    expect(link).toHaveAttribute('href', 'https://youtu.be/demo');
    expect(link).toHaveAttribute('target', '_blank');
  });
});

describe('AttemptInProgress', () => {
  // ADR-0037: видео — ответ на конкретный вопрос, у него на самой форме
  // сдачи есть и кнопка бота с deep link на вопрос, и форма ссылки; поля
  // загрузки файла в кабинете нет и не было — байты через нас не идут.
  it('видео-вопрос — кнопка бота и форма ссылки, без поля загрузки файла', () => {
    renderAttempt(makeAttempt());

    const link = screen.getByRole('link', { name: 'Отправить видео боту в Telegram' });
    expect(link).toHaveAttribute('href', 'https://t.me/xuanxue_bot?start=exam_a1_q3');
    expect(screen.getByLabelText('Ссылка на видео')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /файл/i })).not.toBeInTheDocument();
    const fileInputs = document.querySelectorAll('input[type=file]');
    expect(fileInputs).toHaveLength(0);
  });

  // Два видео-вопроса в одной форме (ADR-0037 «Последствия») должны
  // оставаться различимы: у каждого своя кнопка бота (свой itemId в deep
  // link) и своя строка получения, форма ссылки — только у того, что ещё
  // не получил видео.
  it('два видео-вопроса в одной форме — у каждого свой deep link и своя строка получения', () => {
    const attempt = makeAttempt();
    const block = attempt.blocks[0];
    if (!block) throw new Error('в фикстуре должен быть блок');
    block.questions.push({
      itemId: 'q4',
      version: 1,
      kind: 'video',
      prompt: 'Покажите второй раздел',
      options: [],
    });

    renderAttempt(attempt, {
      video: makeVideo({
        media: [
          {
            id: 'm1',
            attemptId: 'a1',
            itemId: 'q3',
            kind: 'telegram',
            durationSec: 220,
            receivedAt: '2026-09-12T16:30:00.000Z',
          },
        ],
      }),
    });

    expect(screen.getByText('Вы прислали видео боту в Telegram')).toBeInTheDocument();
    expect(
      screen.getByText('Получено Сб, 12 сентября, 19:30, 3 мин 40 с'),
    ).toBeInTheDocument();

    const links = screen.getAllByRole('link', {
      name: 'Отправить видео боту в Telegram',
    });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://t.me/xuanxue_bot?start=exam_a1_q4');

    // У вопроса без ответа форма открыта, у ответившего — убрана под тихое
    // «Прислать другую ссылку»: ответ уже дан, и открытое поле читалось бы
    // громче самого ответа (снимок владельца 2026-09-21). Заменить по-прежнему
    // можно — одним нажатием (ADR-0086).
    expect(screen.getAllByLabelText('Ссылка на видео')).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Прислать другую ссылку' }),
    ).toBeInTheDocument();
  });

  it('отправка ссылки у видео-вопроса зовёт video.addMediaLink с itemId этого вопроса', async () => {
    const addMediaLink = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    renderAttempt(makeAttempt(), { video: makeVideo({ addMediaLink }) });

    await user.type(screen.getByLabelText('Ссылка на видео'), 'https://example.com/v');
    await user.click(screen.getByRole('button', { name: 'Сохранить ссылку' }));

    expect(addMediaLink).toHaveBeenCalledWith('q3', 'https://example.com/v');
  });

  it('выбор варианта сохраняет ответ сразу — PATCH с optionIds', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAttempt(makeAttempt());

    await user.click(screen.getByRole('radio', { name: 'Пять' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/answers', {
        method: 'PATCH',
        body: { answers: [{ itemId: 'q1', optionIds: ['o2'] }] },
      }),
    );
  });

  // Поле свободного ответа подписано самой формулировкой вопроса
  // (`aria-labelledby`, AttemptQuestion.tsx) — видимой подписи-дубля под
  // вопросом больше нет, и находить поле надо по вопросу.
  it('уход с текстового вопроса (blur) сохраняет ответ', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAttempt(makeAttempt());

    const textarea = screen.getByLabelText('Опишите дыхание');
    await user.click(textarea);
    await user.type(textarea, 'Ровно и глубоко');
    await user.tab();

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/attempts/a1/answers', {
        method: 'PATCH',
        body: { answers: [{ itemId: 'q2', text: 'Ровно и глубоко' }] },
      }),
    );
  });

  // Гейт: check-vitest-coverage-ratchet.mjs (functions) — `onBlur` в
  // AttemptQuestion.tsx сам ловит провал flush() (`.catch(() => {})`), это
  // тихий фоновый путь: status уже показывает сбой, экран не должен упасть
  // и не должен звать submit() сам.
  it('уход с текстового вопроса (blur), PATCH падает — сбой тихий, статус «не сохранилось»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('сеть недоступна'));
    const user = userEvent.setup();
    renderAttempt(makeAttempt());

    const textarea = screen.getByLabelText('Опишите дыхание');
    await user.click(textarea);
    await user.type(textarea, 'Ровно и глубоко');
    await user.tab();

    expect(
      await screen.findByText('Не сохранилось — попробуем ещё раз'),
    ).toBeInTheDocument();
  });

  it('отправка — требует подтверждения и зовёт onSubmit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAnswered();

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    const dialog = screen.getByRole('dialog', { name: 'Отправить экзамен?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  // Заголовок useAttemptAutosave.ts: сервер отклонил сохранение по дедлайну —
  // `onExpired` зовёт `reload` (сама передача колбэка проверена здесь, детали
  // «не повторять бесконечно» — в useAttemptAutosave.test.ts).
  it('сервер отклонил PATCH как «время вышло» — попытка перечитывается через reload', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(ATTEMPT_EXPIRED_MESSAGE, 400, 'invalid_input'),
    );
    const user = userEvent.setup();
    const { reload } = renderAttempt(makeAttempt());

    await user.click(screen.getByRole('radio', { name: 'Пять' }));

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });

  // Блокер аудита 2026-09-15 «Дедлайн решает сервер» (ТЗ 4.4, п.7): раньше
  // этот компонент сам решал «экзамен окончен» по местным часам и показывал
  // терминальный экран навсегда, даже когда сервер потом отвечал, что
  // попытка ещё жива. Теперь «конец экзамена» решает только AttemptScreen.tsx
  // по attempt.status с сервера — этот компонент лишь спрашивает сервер
  // (reload) и продолжает показывать форму, пока он не ответит.
  it('локальный дедлайн истёк — попытка перечитывается один раз, но терминальный экран здесь не рисуется', async () => {
    const { reload } = renderAttempt(
      makeAttempt({ deadlineAt: new Date(Date.now() - 1000).toISOString() }),
    );

    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByText('Время экзамена вышло. Попытка закрыта, ответ не сохранён.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeInTheDocument();
  });

  it('часы телефона спешат — сервер ещё не закрыл попытку: экзамен остаётся рабочим, не запертым навсегда', async () => {
    const user = userEvent.setup();
    // Дедлайн уже в прошлом по местным часам, но сервер прислал именно эту
    // попытку через GET /attempts со статусом in_progress — расхождение
    // часов клиента и сервера, ровно то, что нельзя запирать.
    const { onSubmit } = renderAnswered({
      deadlineAt: new Date(Date.now() - 1000).toISOString(),
      status: 'in_progress',
    });

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    const dialog = screen.getByRole('dialog', { name: 'Отправить экзамен?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

// Вопросы без ответа перед отправкой (просьба владельца 2026-09-22):
// подсветка строк и подтверждение, которое называет число и зовёт обратно в
// форму. Правило «что считается ответом» проверяется без DOM —
// attemptUnanswered.test.ts, здесь только поведение экрана.
describe('AttemptInProgress — вопросы без ответа', () => {
  it('форму ещё заполняют — ни одной отметки «Без ответа»', () => {
    renderAttempt(makeAttempt());

    expect(screen.queryByText('Без ответа')).not.toBeInTheDocument();
  });

  it('«Отправить» при пустой форме — подтверждение с числом, отметки у вопросов, отправки нет', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAttempt(makeAttempt());

    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    const dialog = screen.getByRole('dialog', { name: 'Отправить без ответов?' });
    expect(within(dialog).getByText(/Без ответа 3 вопроса\./)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Вернуться к вопросам' }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByText('Без ответа')).toHaveLength(3);
  });

  it('ответили после возврата — отметка этого вопроса уходит сама', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAttempt(makeAttempt());
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Вернуться к вопросам',
      }),
    );

    await user.click(screen.getByRole('radio', { name: 'Пять' }));

    expect(screen.getAllByText('Без ответа')).toHaveLength(2);
  });

  // CLAUDE.md «Ноль нагрузки на ученика»: пропустить вопрос — его право,
  // подтверждение спрашивает один раз и не запирает отправку.
  it('«Всё равно отправить» — работа уходит учителю как есть', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAttempt(makeAttempt());

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Всё равно отправить',
      }),
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('видео прислано, а варианты и текст отвечены — обычное подтверждение без отметок', async () => {
    const user = userEvent.setup();
    renderAnswered();

    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(
      screen.getByRole('dialog', { name: 'Отправить экзамен?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Без ответа')).not.toBeInTheDocument();
  });
});

// Переезд на «Тёплую школу» (ADR-0043, владелец согласовал 2026-09-20): вопросы
// экрана сдачи легли в карточку, как разбор попытки у учителя
// (grading/AttemptReviewScreen.test.tsx). jsdom не вычисляет `var(--…)` —
// сравниваем ровно строку инлайн-стиля, не вычисленный цвет.
describe('AttemptInProgress — облик (ADR-0043)', () => {
  it('вопросы обёрнуты в карточку с фоном var(--card)', () => {
    const { container } = renderAttempt(makeAttempt());

    const cards = Array.from(container.querySelectorAll<HTMLElement>('div')).filter(
      (el) => el.style.background === 'var(--card)',
    );
    expect(cards).toHaveLength(1);
  });
});
