// Блок «О каких занятиях» (LessonScopeSection.tsx, ADR-0185): галочки занятий
// для напоминания «Занятие скоро». Каждая галочка — `PATCH` с одним изменением,
// экран рисуется из его ответа; неясный исход проверяется одним чтением. Снимок
// блок не грузит: его отдаёт экран (useReminderSync.ts), поэтому здесь тонкая
// обвязка, которая делает то же, что экран. Правила автомата —
// reminderSyncState.test.ts, сетевая часть — useReminderSync.test.tsx.
// Пояс зрителя задан явно (CLAUDE.md «Детерминизм»): по умолчанию — пояс школы,
// чтобы подпись пояса не зависела от машины, на которой идёт тест.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { makeMe } from '../test-support/meFixture';
import {
  EVENING,
  EVENING_ID,
  LESSON_ID,
  MORNING,
  MORNING_ID,
  announceConnection,
  deferred,
  makeSnapshot,
  restoreConnectionBetweenTests,
  sentChanges,
  serveScripted,
  syncCalls,
} from '../test-support/reminderSyncFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { LessonScopeSection } from './LessonScopeSection';
import { useReminderSync } from './useReminderSync';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Корректный ObjectId, которого нет в каталоге: занятие, ушедшее из расписания.
const GONE_ID = '65f0000000000000000000ff';
restoreConnectionBetweenTests();
stubViewerTimeZone('Asia/Jerusalem');

const MORNING_NAME = 'Тайцзи для начинающих · утро';
const NOTHING_TICKED = 'Ничего не отмечено — напоминаний о занятиях не будет.';
const CHECKING = 'Не знаем, сохранилось ли, — проверяем…';
const OFFLINE = 'Нет сети. Настройки напоминаний можно менять, когда она появится.';

function SectionWithData() {
  return <LessonScopeSection sync={useReminderSync()} />;
}

function renderSection() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <SectionWithData />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const morning = () => screen.findByRole('checkbox', { name: MORNING_NAME });
const evening = () => screen.findByRole('checkbox', { name: 'Цигун' });

describe('LessonScopeSection — кому показывается и как объясняет', () => {
  it('ученику — заголовок и объяснение с акцентом про «Занятие скоро», без выбора «обо всех / только о выбранных»', async () => {
    serveScripted();
    renderSection();

    await morning();
    expect(screen.getByRole('heading', { name: 'О каких занятиях' })).toBeVisible();
    expect(screen.getByText(/Отметьте занятия, на которые ходите/)).toHaveTextContent(
      'Отметьте занятия, на которые ходите, — напоминание «Занятие скоро» придёт только о них. На отмены занятий отметки не влияют.',
    );
    expect(screen.getByText('только о них').tagName).toBe('STRONG');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — блока нет и за снимком никто не ходит',
    async (role) => {
      serveScripted({ me: makeMe({ roles: [role] }) });
      renderSection();

      await waitFor(() =>
        expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me', expect.anything()),
      );
      await waitFor(() =>
        expect(
          screen.queryByRole('heading', { name: 'О каких занятиях' }),
        ).not.toBeInTheDocument(),
      );
      expect(syncCalls('GET')).toHaveLength(0);
    },
  );
});

describe('LessonScopeSection — список занятий', () => {
  it('занятия из снимка: название, группа, дни и время; отмечены те, что в classIds', async () => {
    serveScripted({ read: makeSnapshot({ classIds: [MORNING_ID] }) });
    renderSection();

    expect(await morning()).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Цигун' })).not.toBeChecked();
    expect(screen.getByText('пн · 10:00')).toBeInTheDocument();
    expect(screen.getByText('ср · 19:00')).toBeInTheDocument();
    // Пояс школы совпал с поясом зрителя — подписывать нечего.
    expect(screen.queryByText(/по часам школы/)).not.toBeInTheDocument();
  });

  it('вёрстка списка — один общий список, строки не слипаются (ADR-0088)', async () => {
    serveScripted();
    renderSection();

    const list = (await screen.findAllByRole('list'))[0];
    expect(list).toBeDefined();
    expect(within(list as HTMLElement).getAllByRole('listitem')).toHaveLength(2);
  });

  it('в расписании нет занятий — честная строка вместо пустого списка', async () => {
    serveScripted({ read: makeSnapshot({ classes: [] }) });
    renderSection();

    expect(await screen.findByText('В расписании пока нет занятий.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('ничего не отмечено — строка «напоминаний не будет»', async () => {
    serveScripted();
    renderSection();

    expect(await screen.findByText(NOTHING_TICKED)).toBeInTheDocument();
  });

  it('отмечено хоть одно — строки нет', async () => {
    serveScripted({ read: makeSnapshot({ classIds: [EVENING_ID] }) });
    renderSection();

    await evening();
    expect(screen.queryByText(NOTHING_TICKED)).not.toBeInTheDocument();
  });

  it('в выборе остался id занятия, которого в списке нет, — строка всё равно есть', async () => {
    serveScripted({ read: makeSnapshot({ classIds: [GONE_ID] }) });
    renderSection();

    expect(await screen.findByText(NOTHING_TICKED)).toBeInTheDocument();
  });

  // Отдельные занятия из приложения дают напоминания без галочек в списке:
  // «не будет» было бы неправдой.
  it('есть отдельные занятия из приложения — строки «не будет» нет', async () => {
    serveScripted({ read: makeSnapshot({ lessonIds: [LESSON_ID] }) });
    renderSection();

    await morning();
    expect(screen.queryByText(NOTHING_TICKED)).not.toBeInTheDocument();
  });
});

describe('LessonScopeSection — пояс школы', () => {
  stubViewerTimeZone('Australia/Sydney');

  it('зритель в другом поясе — время остаётся школьным, пояс школы назван один раз над списком', async () => {
    // Правило повторяется каждую неделю и хранится в поясе школы; «Расписание»
    // штата показывает его так же. Пересчёта на часы зрителя нет.
    serveScripted();
    renderSection();

    await evening();
    expect(screen.getByText('пн · 10:00')).toBeInTheDocument();
    expect(screen.getByText('ср · 19:00')).toBeInTheDocument();
    expect(screen.getAllByText(/Время — по часам школы/)).toHaveLength(1);
    expect(screen.getByText('Asia/Jerusalem').tagName).toBe('STRONG');
  });
});

describe('LessonScopeSection — запись галочки', () => {
  it('галочка шлёт PATCH ровно с одним изменением class и берёт состояние из ответа', async () => {
    const user = userEvent.setup();
    const replies = serveScripted({ read: makeSnapshot({ classIds: [MORNING_ID] }) });
    renderSection();
    const box = await evening();
    // Сервер ответил не тем, что ушло (занятие переименовали, пока экран был
    // открыт): экран обязан показать ответ, а не собственное предположение.
    replies.write = makeSnapshot({
      revision: '2',
      classIds: [MORNING_ID, EVENING_ID],
      classes: [MORNING, { ...EVENING, title: 'Цигун вечером' }],
    });

    await user.click(box);

    expect(await screen.findByRole('checkbox', { name: 'Цигун вечером' })).toBeChecked();
    expect(syncCalls('PATCH')).toHaveLength(1);
    expect(syncCalls('PATCH')[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: {
          version: 1,
          changes: [{ kind: 'class', id: EVENING_ID, selected: true }],
        },
      }),
    );
    // Второго GET за тем же самым нет (ADR-0087).
    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('снятая галочка шлёт selected: false, остальные остаются', async () => {
    const user = userEvent.setup();
    const replies = serveScripted({
      read: makeSnapshot({ classIds: [MORNING_ID, EVENING_ID] }),
    });
    renderSection();
    const box = await morning();
    replies.write = makeSnapshot({ revision: '2', classIds: [EVENING_ID] });

    await user.click(box);

    await waitFor(() => expect(box).not.toBeChecked());
    expect(screen.getByRole('checkbox', { name: 'Цигун' })).toBeChecked();
    expect(sentChanges()).toEqual([[{ kind: 'class', id: MORNING_ID, selected: false }]]);
  });

  it('снята последняя галочка — после ответа появляется строка «напоминаний не будет»', async () => {
    const user = userEvent.setup();
    const replies = serveScripted({ read: makeSnapshot({ classIds: [EVENING_ID] }) });
    renderSection();
    const box = await evening();
    replies.write = makeSnapshot({ revision: '2', classIds: [] });

    await user.click(box);

    expect(await screen.findByText(NOTHING_TICKED)).toBeInTheDocument();
  });

  it('пока PATCH в пути, все галочки выключены и положение не меняется; потом включаются с новым', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    serveScripted({
      read: makeSnapshot({ classIds: [MORNING_ID] }),
      write: pending.promise,
    });
    renderSection();
    const box = await evening();

    await user.click(box);

    await waitFor(() => expect(box).toBeDisabled());
    expect(await morning()).toBeDisabled();
    // Без оптимистичной отрисовки: галочка не встаёт, пока нет ответа.
    expect(box).not.toBeChecked();

    pending.settle(makeSnapshot({ revision: '2', classIds: [MORNING_ID, EVENING_ID] }));

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Цигун' })).toBeEnabled(),
    );
    expect(screen.getByRole('checkbox', { name: 'Цигун' })).toBeChecked();
  });
});

describe('LessonScopeSection — нет сети', () => {
  it('галочки выключены и сказано почему; сеть вернулась — включены, ничего не отправлено', async () => {
    serveScripted();
    renderSection();
    const box = await evening();

    announceConnection(false);

    expect(box).toBeDisabled();
    expect(await morning()).toBeDisabled();
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();

    announceConnection(true);

    expect(box).toBeEnabled();
    expect(screen.queryByText(OFFLINE)).not.toBeInTheDocument();
    expect(syncCalls('PATCH')).toHaveLength(0);
  });
});

describe('LessonScopeSection — отказ сервера', () => {
  it.each([
    [
      400,
      'invalid_input',
      'Такого занятия больше нет в расписании. Отметьте занятия заново.',
    ],
    [409, 'selection_limit', 'Можно отметить не больше 50 занятий.'],
  ] as const)(
    '%i: текст сервера виден как есть, галочка прежняя, следующий выбор уходит',
    async (status, code, message) => {
      const user = userEvent.setup();
      const replies = serveScripted({ write: new ApiError(message, status, code) });
      renderSection();
      const box = await evening();

      await user.click(box);

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(box).not.toBeChecked();
      expect(box).toBeEnabled();
      expect(syncCalls('GET')).toHaveLength(1);

      replies.write = makeSnapshot({ revision: '2', classIds: [EVENING_ID] });
      await user.click(box);

      await waitFor(() => expect(box).toBeChecked());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(syncCalls('PATCH')).toHaveLength(2);
    },
  );
});

describe('LessonScopeSection — неясный исход', () => {
  it('сбой сети: не «не удалось», а «проверяем»; один GET; галочка из чтения; PATCH один; контролы включены', async () => {
    const user = userEvent.setup();
    const reading = deferred();
    const replies = serveScripted();
    renderSection();
    const box = await evening();
    // Сервер запись принял, а ответ потерялся: на нём галочка уже стоит.
    replies.write = new ApiError('Нет связи с сервером.', 0, 'network');
    replies.read = reading.promise;

    await user.click(box);

    expect(await screen.findByText(CHECKING)).toBeInTheDocument();
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();

    reading.settle(makeSnapshot({ revision: '2', classIds: [EVENING_ID] }));

    await waitFor(() => expect(box).toBeEnabled());
    expect(box).toBeChecked();
    expect(screen.queryByText(CHECKING)).not.toBeInTheDocument();
    expect(syncCalls('GET')).toHaveLength(2);
    expect(sentChanges()).toEqual([[{ kind: 'class', id: EVENING_ID, selected: true }]]);
  });

  it.each([
    ['5xx', new ApiError('Сбой', 502, 'internal_error')],
    ['429', new ApiError('Слишком часто', 429, 'rate_limited')],
    ['ответ 2xx не снимок', { version: 1 }],
    ['снимок с версией 2', { ...makeSnapshot({ revision: '2' }), version: 2 }],
  ])(
    '%s: читаем, а не повторяем; после чтения галочка по данным сервера',
    async (_name, failure) => {
      const user = userEvent.setup();
      const replies = serveScripted();
      renderSection();
      const box = await evening();
      replies.write = failure;
      replies.read = makeSnapshot({ revision: '2', classIds: [] });

      await user.click(box);

      await waitFor(() => expect(syncCalls('GET')).toHaveLength(2));
      await waitFor(() => expect(box).toBeEnabled());
      expect(box).not.toBeChecked();
      expect(syncCalls('PATCH')).toHaveLength(1);
    },
  );

  it('ответ записи со старой ревизией и чужого аккаунта не применяются — вместо них чтение', async () => {
    const user = userEvent.setup();
    const replies = serveScripted({
      read: makeSnapshot({ revision: '5', classIds: [MORNING_ID] }),
    });
    renderSection();
    const box = await evening();

    const stale = [
      makeSnapshot({ revision: '4', classIds: [MORNING_ID, EVENING_ID] }),
      makeSnapshot({
        accountId: 'u2',
        revision: '9',
        classIds: [MORNING_ID, EVENING_ID],
      }),
    ];
    for (const [index, response] of stale.entries()) {
      replies.write = response;
      await user.click(box);
      // Чтение номер `index + 2`: первое уходило при открытии экрана.
      await waitFor(() => expect(syncCalls('GET')).toHaveLength(index + 2));
      await waitFor(() => expect(box).toBeEnabled());
      expect(box).not.toBeChecked();
    }

    expect(syncCalls('PATCH')).toHaveLength(2);
    expect(syncCalls('GET')).toHaveLength(3);
  });

  it('проверка не удалась — «Проверить ещё раз», галочки выключены; повтор возвращает управление', async () => {
    const user = userEvent.setup();
    const replies = serveScripted();
    renderSection();
    const box = await evening();
    replies.write = new ApiError('Сбой', 500, 'internal_error');
    replies.read = new ApiError('Сервис недоступен', 503, 'unknown');

    await user.click(box);

    const retry = await screen.findByRole('button', { name: 'Проверить ещё раз' });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Не удалось проверить, сохранилось ли. Менять настройки пока нельзя.',
    );
    expect(box).toBeDisabled();
    expect(syncCalls('GET')).toHaveLength(2);

    replies.read = makeSnapshot({ revision: '2', classIds: [EVENING_ID] });
    await user.click(retry);

    await waitFor(() => expect(box).toBeEnabled());
    expect(box).toBeChecked();
    expect(
      screen.queryByRole('button', { name: 'Проверить ещё раз' }),
    ).not.toBeInTheDocument();
    expect(syncCalls('GET')).toHaveLength(3);
    expect(syncCalls('PATCH')).toHaveLength(1);
  });
});

describe('LessonScopeSection — загрузка', () => {
  it('сбой — баннер с повтором вместо списка, повтор перечитывает снимок', async () => {
    const user = userEvent.setup();
    const replies = serveScripted({ read: new Error('сеть недоступна') });
    renderSection();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить занятия. Попробуйте ещё раз.');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();

    replies.read = makeSnapshot();
    await user.click(within(alert).getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await morning()).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
