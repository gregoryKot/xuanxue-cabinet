// Поле «За сколько напомнить» (LessonReminderField.tsx, ADR-0162, п. 3) в составе
// экрана «Настройки уведомлений»: стоит под переключателем «Занятие скоро» и
// только пока тот включён, данные берёт у общего `GET /me/notifications/lessons`
// (один на экран), запись — `PUT …/reminder-minutes`, экран рисуется из его
// ответа (ADR-0087). Пояс зрителя задан явно, как в соседних тестах экрана.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto, MyLessonNotificationsDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
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
stubViewerTimeZone('Asia/Jerusalem');

const PREFS_PATH = '/me/notifications';
const LESSONS_PATH = '/me/notifications/lessons';
const SCOPE_PATH = '/me/notifications/lessons/scope';
const REMINDER_PATH = '/me/notifications/lessons/reminder-minutes';
const FIELD_LABEL = 'За сколько напомнить';
const SAVE_ERROR = 'Не удалось сохранить. Попробуйте ещё раз.';

const STUDENT: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  email: 'maria@example.com',
  hasEmail: true,
  noTelegram: false,
  needsProfile: false,
  googleLinked: false,
};
const TEACHER: MeDto = { ...STUDENT, id: 't1', roles: ['teacher'] };

const lessons = (
  minutes: number | null,
  schoolMinutes = 60,
): MyLessonNotificationsDto => ({
  scope: { mode: 'all', classIds: [] },
  classes: [],
  reminder: { minutes, schoolMinutes },
});

const SOON_ON = { enabled: ['lesson_soon'] };

interface Responses {
  prefs?: unknown;
  lessons?: unknown;
  scope?: unknown;
  reminder?: unknown;
}

function serve(me: MeDto, responses: Responses = {}) {
  const dto = responses.lessons ?? lessons(null);
  // Узкий путь раньше широкого: `mockApiByPath` берёт первое совпадение по
  // префиксу, а `…/lessons/reminder-minutes` начинается с `…/lessons`, а то — с
  // `/me/notifications`.
  mockApiByPath({
    '/auth/me': me,
    [REMINDER_PATH]: responses.reminder ?? dto,
    [SCOPE_PATH]: responses.scope ?? dto,
    [LESSONS_PATH]: dto,
    [PREFS_PATH]: responses.prefs ?? SOON_ON,
  });
}

function renderScreen(me: MeDto, responses: Responses = {}) {
  serve(me, responses);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationSettingsScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const findField = () => screen.findByLabelText<HTMLSelectElement>(FIELD_LABEL);
const callsTo = (path: string) =>
  mockedApiFetch.mock.calls.filter(([called]) => called === path);

describe('LessonReminderField — что показано', () => {
  it('школьное значение по умолчанию: «Как в школе — за 1 час» и подсказка с акцентом', async () => {
    renderScreen(STUDENT);

    const field = await findField();
    expect(field).toHaveValue('');
    expect(field.selectedOptions[0]).toHaveTextContent('Как в школе — за 1 час');
    expect(
      within(field)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Как в школе — за 1 час',
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
    renderScreen(STUDENT, { lessons: lessons(null, 45) });

    const field = await findField();
    expect(field.selectedOptions[0]).toHaveTextContent('Как в школе — за 45 минут');
    expect(screen.getByText('45 минут', { selector: 'strong' })).toBeInTheDocument();
    expect(within(field).getAllByRole('option')).toHaveLength(5);
  });

  it('свой выбор человека выбран в списке, подсказка называет его срок', async () => {
    renderScreen(STUDENT, { lessons: lessons(120) });

    const field = await findField();
    expect(field).toHaveValue('120');
    expect(field.selectedOptions[0]).toHaveTextContent('За 2 часа');
    expect(screen.getByText('2 часа', { selector: 'strong' })).toBeInTheDocument();
  });

  it('стоит в «Что присылать» сразу под строкой «Занятие скоро», а не под другим видом', async () => {
    renderScreen(STUDENT, { prefs: { enabled: ['lesson_soon', 'exam_result'] } });

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
    renderScreen(STUDENT, { prefs: { enabled: [] } });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument();

    serve(STUDENT, { prefs: SOON_ON });
    await user.click(toggle);
    expect(await findField()).toBeInTheDocument();

    serve(STUDENT, { prefs: { enabled: [] } });
    await user.click(toggle);
    await waitFor(() =>
      expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument(),
    );
  });

  it('включение вида не тянет занятия второй раз: данные уже на экране', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { prefs: { enabled: [] } });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    await screen.findByRole('radio', { name: 'Обо всех занятиях школы' });

    serve(STUDENT, { prefs: SOON_ON });
    await user.click(toggle);
    await findField();

    expect(callsTo(LESSONS_PATH)).toHaveLength(1);
  });

  it('штат — поля нет даже при включённом «Занятие скоро» в ответе, за занятиями никто не ходит', async () => {
    renderScreen(TEACHER, { prefs: { enabled: ['lesson_soon', 'post_draft'] } });

    await screen.findByRole('checkbox', { name: 'Черновик поста' });
    expect(
      screen.queryByRole('checkbox', { name: 'Занятие скоро' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument();
    expect(callsTo(LESSONS_PATH)).toHaveLength(0);
  });

  it('один GET /me/notifications/lessons на экран, хотя читают двое: блок выбора и поле', async () => {
    renderScreen(STUDENT);

    await findField();
    await screen.findByRole('radio', { name: 'Обо всех занятиях школы' });
    expect(callsTo(LESSONS_PATH)).toHaveLength(1);
  });

  it('занятия не загрузились — поля нет, баннер один и стоит у блока «О каких занятиях»', async () => {
    renderScreen(STUDENT, { lessons: new Error('сеть недоступна') });

    await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить занятия. Попробуйте ещё раз.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByLabelText(FIELD_LABEL)).not.toBeInTheDocument();
  });

  it('повтор после сбоя занятий приносит и поле: загрузка одна на оба блока', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { lessons: new Error('сеть недоступна') });
    const alert = await screen.findByRole('alert');

    serve(STUDENT);
    await user.click(within(alert).getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await findField()).toHaveValue('');
    expect(
      await screen.findByRole('radio', { name: 'Обо всех занятиях школы' }),
    ).toBeChecked();
  });
});

describe('LessonReminderField — запись', () => {
  it('«За 30 минут» шлёт PUT {minutes: 30}, подсказка и подписи берутся из ОТВЕТА', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT);
    const field = await findField();

    // Сервер ответил не только выбором, но и новым школьным значением (учитель
    // поменял его, пока экран был открыт): экран рисует ответ, а не догадку.
    serve(STUDENT, { reminder: lessons(30, 45) });
    await user.selectOptions(field, 'За 30 минут');

    await waitFor(() =>
      expect(screen.getByText('30 минут', { selector: 'strong' })).toBeInTheDocument(),
    );
    expect(field).toHaveValue('30');
    expect(field.options[0]).toHaveTextContent('Как в школе — за 45 минут');
    expect(callsTo(REMINDER_PATH)).toHaveLength(1);
    expect(callsTo(REMINDER_PATH)[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'PUT', body: { minutes: 30 } }),
    );
  });

  it('«Как в школе» после своего выбора шлёт {minutes: null} и возвращает школьный срок', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { lessons: lessons(30) });
    const field = await findField();

    serve(STUDENT, { reminder: lessons(null) });
    await user.selectOptions(field, 'Как в школе — за 1 час');

    await waitFor(() => expect(field).toHaveValue(''));
    expect(callsTo(REMINDER_PATH)[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'PUT', body: { minutes: null } }),
    );
    expect(screen.getByText('1 час', { selector: 'strong' })).toBeInTheDocument();
  });

  it('после записи экран не перечитывает занятия: второго GET нет (ADR-0087)', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT);
    const field = await findField();

    serve(STUDENT, { reminder: lessons(15) });
    await user.selectOptions(field, 'За 15 минут');

    await waitFor(() => expect(field).toHaveValue('15'));
    expect(callsTo(LESSONS_PATH)).toHaveLength(1);
  });

  it('пока PUT в пути, поле выключено и положение не меняется, потом включается с новым', async () => {
    const user = userEvent.setup();
    let finishPut: (value: unknown) => void = () => undefined;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === PREFS_PATH) return Promise.resolve(SOON_ON);
      if (path === LESSONS_PATH) return Promise.resolve(lessons(null));
      if (path === REMINDER_PATH) {
        return new Promise((resolve) => {
          finishPut = resolve;
        });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationSettingsScreen />
        </AuthProvider>
      </MemoryRouter>,
    );
    const field = await findField();

    await user.selectOptions(field, 'За 2 часа');

    await waitFor(() => expect(field).toBeDisabled());
    // Без оптимистичной отрисовки: выбор не меняется, пока нет ответа.
    expect(field).toHaveValue('');

    finishPut(lessons(120));

    await waitFor(() => expect(field).toBeEnabled());
    expect(field).toHaveValue('120');
  });

  it('ответ сервера с текстом — он виден под полем, выбор прежний, поле снова доступно', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT);
    const field = await findField();

    const message = 'Выберите время из списка: 15, 30, 60 или 120 минут.';
    serve(STUDENT, { reminder: new ApiError(message, 400, 'invalid_input') });
    await user.selectOptions(field, 'За 30 минут');

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(field).toBeEnabled();
  });

  it('неопознанная ошибка — общий текст, не текст исключения', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT);
    const field = await findField();

    serve(STUDENT, { reminder: new Error('boom') });
    await user.selectOptions(field, 'За 30 минут');

    expect(await screen.findByText(SAVE_ERROR)).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    expect(field).toHaveValue('');
  });

  it('следующая попытка убирает прошлую ошибку', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT);
    const field = await findField();
    serve(STUDENT, { reminder: new Error('boom') });
    await user.selectOptions(field, 'За 30 минут');
    await screen.findByText(SAVE_ERROR);

    serve(STUDENT, { reminder: lessons(30) });
    await user.selectOptions(field, 'За 30 минут');

    await waitFor(() => expect(screen.queryByText(SAVE_ERROR)).not.toBeInTheDocument());
    expect(field).toHaveValue('30');
  });

  // Выбор занятий и «за сколько» пишут две разные части одного ресурса, и ответ
  // каждого PUT несёт обе. Ответ раньше уехавшего PUT принёс бы чужую часть в
  // состоянии «до» и затёр бы свежую: экран показал бы 1 час, а сервер уже
  // знает про 30 минут.
  it('ответ выбора занятий, пришедший позже, не затирает только что сохранённое «за сколько»', async () => {
    const user = userEvent.setup();
    let finishScope: (value: unknown) => void = () => undefined;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === PREFS_PATH) return Promise.resolve(SOON_ON);
      if (path === LESSONS_PATH) return Promise.resolve(lessons(null));
      if (path === REMINDER_PATH) return Promise.resolve(lessons(30));
      if (path === SCOPE_PATH) {
        return new Promise((resolve) => {
          finishScope = resolve;
        });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationSettingsScreen />
        </AuthProvider>
      </MemoryRouter>,
    );
    const field = await findField();
    await user.click(await screen.findByRole('radio', { name: 'Только о выбранных' }));
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Только о выбранных' })).toBeDisabled(),
    );

    await user.selectOptions(field, 'За 30 минут');
    await waitFor(() => expect(field).toHaveValue('30'));

    // Сервер собрал этот ответ раньше записи «за сколько»: reminder в нём старый.
    finishScope({ ...lessons(null), scope: { mode: 'selected', classIds: [] } });

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Только о выбранных' })).toBeChecked(),
    );
    expect(field).toHaveValue('30');
    expect(screen.getByText('30 минут', { selector: 'strong' })).toBeInTheDocument();
  });
});
