// Форма сдачи целиком (ТЗ п.2) — вопросы по типам, автосохранение реальным
// PATCH (детали дебаунса/повтора — useAttemptAutosave.test.ts), отправка с
// подтверждением, истёкший дедлайн.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ATTEMPT_EXPIRED_MESSAGE, type ExamAttemptDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { AttemptInProgress } from './AttemptInProgress';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

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
        required: true,
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

function renderAttempt(
  attempt: ExamAttemptDto,
  extra: Partial<Parameters<typeof AttemptInProgress>[0]> = {},
) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const reload = vi.fn().mockResolvedValue(undefined);
  render(
    <MemoryRouter>
      <AttemptInProgress
        attempt={attempt}
        reload={reload}
        onSubmit={onSubmit}
        submitting={false}
        submitError={null}
        {...extra}
      />
    </MemoryRouter>,
  );
  return { onSubmit, reload };
}

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
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/осталось/i)).toBeInTheDocument();
  });
});

describe('AttemptInProgress', () => {
  it('видео-вопрос — честная строка, без поля загрузки', () => {
    renderAttempt(makeAttempt());

    expect(
      screen.getByText(/Видео пришлёте боту после того, как отправите работу/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/видео/i)).not.toBeInTheDocument();
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

  it('уход с текстового вопроса (blur) сохраняет ответ', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAttempt(makeAttempt());

    const textarea = screen.getByLabelText('Ответ на вопрос 2');
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

  it('отправка — требует подтверждения и зовёт onSubmit', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderAttempt(makeAttempt());

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
    const { onSubmit } = renderAttempt(
      // Дедлайн уже в прошлом по местным часам, но сервер прислал именно эту
      // попытку через GET /attempts со статусом in_progress — расхождение
      // часов клиента и сервера, ровно то, что нельзя запирать.
      makeAttempt({
        deadlineAt: new Date(Date.now() - 1000).toISOString(),
        status: 'in_progress',
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    const dialog = screen.getByRole('dialog', { name: 'Отправить экзамен?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отправить' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
