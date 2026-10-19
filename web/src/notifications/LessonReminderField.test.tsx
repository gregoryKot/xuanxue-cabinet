// Поле «За сколько напомнить» (LessonReminderField.tsx, ADR-0185) в составе
// экрана «Настройки уведомлений»: стоит под переключателем «Занятие скоро» и
// только пока тот включён, снимок берёт у общего `GET …/lessons/sync` (один на
// экран, делит его с блоком «О каких занятиях»), запись — `PATCH` с изменением
// `lead`, экран рисуется из его ответа (ADR-0087). Правила автомата —
// reminderSyncState.test.ts. Пояс зрителя задан явно, как в соседних тестах.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { makeMe } from '../test-support/meFixture';
import {
  announceConnection,
  deferred,
  makeSnapshot,
  restoreConnectionBetweenTests,
  sentChanges,
  serveScripted,
  syncCalls,
} from '../test-support/reminderSyncFixtures';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import NotificationSettingsScreen from './NotificationSettingsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('./PushNotificationsSection', () => ({
  PushNotificationsSection: () => <h2 className="xuanxue-eyebrow">Push-уведомления</h2>,
}));

resetApiFetchBetweenTests();
restoreConnectionBetweenTests();
stubViewerTimeZone('Asia/Jerusalem');

const PREFS_PATH = '/me/notifications';
const FIELD_LABEL = 'За сколько напомнить';
const SOON_ON = { enabled: ['lesson_soon'] };
const MORNING_NAME = 'Тайцзи для начинающих · утро';

type ScriptedInit = Parameters<typeof serveScripted>[0];

function renderScreen(init: ScriptedInit = {}, prefs: unknown = SOON_ON) {
  const others: Record<string, unknown> = { [PREFS_PATH]: prefs, ...init?.others };
  const replies = serveScripted({ ...init, others });
  render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationSettingsScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
  return { replies, others };
}

const findField = () => screen.findByLabelText<HTMLSelectElement>(FIELD_LABEL);

describe('LessonReminderField — что показано', () => {
  it('школьное значение по умолчанию: «Как в школе — за 1 час» и подсказка с акцентом', async () => {
    renderScreen();

    const field = await findField();
    expect(field).toHaveValue('');
    expect(field.selectedOptions[0]).toHaveTextContent('Как в школе — за 1 час');
    expect(
      within(field)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Как в школе — за 1 час',
      'В момент начала',
      'За 15 минут',
      'За 30 минут',
      'За 1 час',
      'За 2 часа',
    ]);
    expect(screen.getByText(/Напоминание придёт за/)).toHaveTextContent(
      'Напоминание придёт за 1 час до начала занятия.',
    );
    expect(screen.getByText('1 час', { selector: 'strong' })).toBeInTheDocument();
  });

  it('школьное значение не из списка (45 минут) — первый пункт называет его, а не подменяет', async () => {
    renderScreen({ read: makeSnapshot({ schoolMinutes: 45 }) });

    const field = await findField();
    expect(field.selectedOptions[0]).toHaveTextContent('Как в школе — за 45 минут');
    expect(screen.getByText('45 минут', { selector: 'strong' })).toBeInTheDocument();
    expect(within(field).getAllByRole('option')).toHaveLength(6);
  });

  it('свой выбор человека выбран в списке, подсказка называет его срок', async () => {
    renderScreen({ read: makeSnapshot({ leadMinutes: 120 }) });

    const field = await findField();
    expect(field).toHaveValue('120');
    expect(field.selectedOptions[0]).toHaveTextContent('За 2 часа');
    expect(screen.getByText('2 часа', { selector: 'strong' })).toBeInTheDocument();
  });

  // Ноль — напоминание в момент начала, а не «Как в школе» и не «выключено».
  it('«В момент начала» выбран по 0, подсказка называет момент начала', async () => {
    renderScreen({ read: makeSnapshot({ leadMinutes: 0 }) });

    const field = await findField();
    expect(field).toHaveValue('0');
    expect(field.selectedOptions[0]).toHaveTextContent('В момент начала');
    expect(screen.getByText(/Напоминание придёт/)).toHaveTextContent(
      'Напоминание придёт в момент начала занятия.',
    );
    expect(
      screen.getByText('в момент начала', { selector: 'strong' }),
    ).toBeInTheDocument();
  });

  it('стоит в «Что присылать» сразу под строкой «Занятие скоро», а не под другим видом', async () => {
    renderScreen({}, { enabled: ['lesson_soon', 'exam_result'] });

    const field = await findField();
    const item = screen.getByRole('checkbox', { name: 'Занятие скоро' }).closest('li');
    expect(item).not.toBeNull();
    expect(item).toContainElement(field);
    const examItem = screen
      .getByRole('checkbox', { name: 'Результат экзамена' })
      .closest('li');
    expect(examItem).not.toContainElement(field);
  });
});

describe('LessonReminderField — когда виден', () => {
  it('вид выключен — поля нет, включили — появилось, выключили — исчезло', async () => {
    const user = userEvent.setup();
    const { others } = renderScreen({}, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument();

    others[PREFS_PATH] = SOON_ON;
    await user.click(toggle);
    expect(await findField()).toBeInTheDocument();

    others[PREFS_PATH] = { enabled: [] };
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument(),
    );
  });

  it('включение вида не тянет снимок второй раз: данные уже на экране', async () => {
    const user = userEvent.setup();
    const { others } = renderScreen({}, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    await screen.findByRole('checkbox', { name: MORNING_NAME });

    others[PREFS_PATH] = SOON_ON;
    await user.click(toggle);
    await findField();

    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('штат — поля нет даже при включённом «Занятие скоро» в ответе, за снимком никто не ходит', async () => {
    renderScreen(
      { me: makeMe({ roles: ['teacher'] }) },
      {
        enabled: ['lesson_soon', 'post_draft'],
      },
    );

    await screen.findByRole('checkbox', { name: 'Черновик поста' });
    expect(
      screen.queryByRole('checkbox', { name: 'Занятие скоро' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument();
    expect(syncCalls('GET')).toHaveLength(0);
  });

  it('один GET снимка на экран, хотя читают двое: блок выбора и поле', async () => {
    renderScreen();

    await findField();
    await screen.findByRole('checkbox', { name: MORNING_NAME });
    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('снимок не загрузился — поля нет, баннер один и стоит у блока «О каких занятиях»', async () => {
    renderScreen({ read: new Error('сеть недоступна') });

    await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить занятия. Попробуйте ещё раз.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument();
  });

  it('повтор после сбоя приносит и поле, и список: загрузка одна на оба блока', async () => {
    const user = userEvent.setup();
    const { replies } = renderScreen({ read: new Error('сеть недоступна') });
    const alert = await screen.findByRole('alert');

    replies.read = makeSnapshot();
    await user.click(within(alert).getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await findField()).toHaveValue('');
    expect(
      await screen.findByRole('checkbox', { name: MORNING_NAME }),
    ).toBeInTheDocument();
  });
});

describe('LessonReminderField — запись', () => {
  it('«За 30 минут» шлёт PATCH lead 30, подсказка и подписи берутся из ОТВЕТА', async () => {
    const user = userEvent.setup();
    const { replies } = renderScreen();
    const field = await findField();
    // Сервер ответил не только выбором, но и новым школьным значением (учитель
    // поменял его, пока экран был открыт): экран рисует ответ, а не догадку.
    replies.write = makeSnapshot({ revision: '2', leadMinutes: 30, schoolMinutes: 45 });

    await user.selectOptions(field, 'За 30 минут');

    await waitFor(() =>
      expect(screen.getByText('30 минут', { selector: 'strong' })).toBeInTheDocument(),
    );
    expect(field).toHaveValue('30');
    expect(field.options[0]).toHaveTextContent('Как в школе — за 45 минут');
    expect(syncCalls('PATCH')).toHaveLength(1);
    expect(syncCalls('PATCH')[0]?.[1]).toEqual(
      expect.objectContaining({
        method: 'PATCH',
        body: { version: 1, changes: [{ kind: 'lead', minutes: 30 }] },
      }),
    );
  });

  it('«В момент начала» шлёт минуты 0, а не null, и рисует подсказку про момент начала', async () => {
    const user = userEvent.setup();
    const { replies } = renderScreen();
    const field = await findField();
    replies.write = makeSnapshot({ revision: '2', leadMinutes: 0 });

    await user.selectOptions(field, 'В момент начала');

    await waitFor(() => expect(field).toHaveValue('0'));
    expect(sentChanges()).toEqual([[{ kind: 'lead', minutes: 0 }]]);
    expect(
      screen.getByText('в момент начала', { selector: 'strong' }),
    ).toBeInTheDocument();
  });

  it('«Как в школе» после своего выбора шлёт minutes: null и возвращает школьный срок', async () => {
    const user = userEvent.setup();
    const { replies } = renderScreen({ read: makeSnapshot({ leadMinutes: 30 }) });
    const field = await findField();
    replies.write = makeSnapshot({ revision: '2', leadMinutes: null });

    await user.selectOptions(field, 'Как в школе — за 1 час');

    await waitFor(() => expect(field).toHaveValue(''));
    expect(sentChanges()).toEqual([[{ kind: 'lead', minutes: null }]]);
    expect(screen.getByText('1 час', { selector: 'strong' })).toBeInTheDocument();
  });

  it('после записи экран не перечитывает снимок: второго GET нет (ADR-0087)', async () => {
    const user = userEvent.setup();
    const { replies } = renderScreen();
    const field = await findField();
    replies.write = makeSnapshot({ revision: '2', leadMinutes: 15 });

    await user.selectOptions(field, 'За 15 минут');

    await waitFor(() => expect(field).toHaveValue('15'));
    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('пока PATCH в пути, поле выключено и положение не меняется, потом включается с новым', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    renderScreen({ write: pending.promise });
    const field = await findField();

    await user.selectOptions(field, 'За 2 часа');

    await waitFor(() => expect(field).toBeDisabled());
    // Без оптимистичной отрисовки: выбор не меняется, пока нет ответа.
    expect(field).toHaveValue('');

    pending.settle(makeSnapshot({ revision: '2', leadMinutes: 120 }));

    await waitFor(() => expect(field).toBeEnabled());
    expect(field).toHaveValue('120');
  });

  // Запись одна на весь экран: пока летит выбор занятия, поле заперто, и
  // наоборот — два PATCH разных контролов не обгоняют друг друга.
  it('запись галочки запирает поле', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    renderScreen({ write: pending.promise });
    const field = await findField();

    await user.click(await screen.findByRole('checkbox', { name: 'Цигун' }));

    await waitFor(() => expect(field).toBeDisabled());
    pending.settle(makeSnapshot({ revision: '2', classIds: ['c2'] }));
    await waitFor(() => expect(field).toBeEnabled());
  });

  it('запись поля запирает галочки', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    renderScreen({ write: pending.promise });
    const field = await findField();
    const box = await screen.findByRole('checkbox', { name: 'Цигун' });

    await user.selectOptions(field, 'За 30 минут');

    await waitFor(() => expect(box).toBeDisabled());
    expect(screen.getByRole('checkbox', { name: MORNING_NAME })).toBeDisabled();
    pending.settle(makeSnapshot({ revision: '2', leadMinutes: 30 }));
    await waitFor(() => expect(box).toBeEnabled());
  });
});

describe('LessonReminderField — нет сети и отказы', () => {
  it('нет сети — поле выключено и сказано почему; сеть вернулась — включено', async () => {
    renderScreen();
    const field = await findField();

    announceConnection(false);

    expect(field).toBeDisabled();
    expect(screen.getAllByText(/Нет сети/).length).toBeGreaterThan(0);

    announceConnection(true);

    expect(field).toBeEnabled();
    expect(syncCalls('PATCH')).toHaveLength(0);
  });

  it('ответ сервера с текстом — он виден под полем, выбор прежний, поле снова доступно', async () => {
    const user = userEvent.setup();
    const message =
      'Выберите время из списка: в момент начала, 15, 30, 60 или 120 минут.';
    renderScreen({ write: new ApiError(message, 400, 'invalid_input') });
    const field = await findField();

    await user.selectOptions(field, 'За 30 минут');

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(field).toBeEnabled();
    expect(syncCalls('GET')).toHaveLength(1);
  });

  it('отказ про галочки не появляется под полем «за сколько»', async () => {
    const user = userEvent.setup();
    const message = 'Можно отметить не больше 50 занятий.';
    renderScreen({ write: new ApiError(message, 409, 'selection_limit') });
    await findField();

    await user.click(await screen.findByRole('checkbox', { name: 'Цигун' }));

    // Текст один — под списком; под полем «за сколько» его нет.
    expect(await screen.findAllByText(message)).toHaveLength(1);
  });

  it('следующая попытка убирает прошлый отказ', async () => {
    const user = userEvent.setup();
    const message = 'Выберите время из списка.';
    const { replies } = renderScreen({
      write: new ApiError(message, 400, 'invalid_input'),
    });
    const field = await findField();
    await user.selectOptions(field, 'За 30 минут');
    await screen.findByText(message);

    replies.write = makeSnapshot({ revision: '2', leadMinutes: 30 });
    await user.selectOptions(field, 'За 30 минут');

    await waitFor(() => expect(screen.queryByText(message)).not.toBeInTheDocument());
    expect(field).toHaveValue('30');
  });

  it('сбой сети: «проверяем», а не «не удалось»; один GET; значение из чтения; PATCH один', async () => {
    const user = userEvent.setup();
    const reading = deferred();
    const { replies } = renderScreen();
    const field = await findField();
    replies.write = new ApiError('Нет связи с сервером.', 0, 'network');
    replies.read = reading.promise;

    await user.selectOptions(field, 'За 15 минут');

    expect(
      (await screen.findAllByText(/Не знаем, сохранилось ли/)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Не удалось сохранить/)).not.toBeInTheDocument();
    expect(field).toBeDisabled();
    expect(field).toHaveValue('');

    reading.settle(makeSnapshot({ revision: '2', leadMinutes: 15 }));

    await waitFor(() => expect(field).toBeEnabled());
    expect(field).toHaveValue('15');
    expect(syncCalls('GET')).toHaveLength(2);
    expect(sentChanges()).toEqual([[{ kind: 'lead', minutes: 15 }]]);
  });

  it('неопознанная ошибка не показывает текст исключения', async () => {
    const user = userEvent.setup();
    const { replies } = renderScreen({ write: new Error('boom') });
    const field = await findField();
    replies.read = makeSnapshot();

    await user.selectOptions(field, 'За 30 минут');

    await waitFor(() => expect(syncCalls('GET')).toHaveLength(2));
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    expect(field).toHaveValue('');
  });
});
