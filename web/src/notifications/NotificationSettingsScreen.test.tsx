// Экран «Настройки уведомлений» (ADR-0162): три блока в порядке «на какое
// устройство — о каких занятиях — что присылать». Проверки переключателей видов,
// подсказки про бота и сбоя загрузки перенесены сюда из ProfileScreen.test.tsx,
// где раздел жил до переезда (CLAUDE.md «Отказались от механики — удаляем с
// концами»: покрытие осталось, поменялся адрес). Блок push здесь заменён
// заглушкой — его состояния держит PushNotificationsSection.test.tsx; блок
// «О каких занятиях» в подробностях — LessonScopeSection.test.tsx, а поле «За
// сколько напомнить» под «Занятие скоро» — LessonReminderField.test.tsx.
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

const LESSONS: MyLessonNotificationsDto = {
  scope: { mode: 'all', classIds: [] },
  classes: [],
  reminder: { minutes: null, schoolMinutes: 60 },
};

function serve(me: MeDto, prefs: unknown = { enabled: [] }) {
  // Узкий путь раньше широкого: `mockApiByPath` берёт первое совпадение по
  // префиксу, а `/me/notifications/lessons` начинается с `/me/notifications`.
  mockApiByPath({
    '/auth/me': me,
    [LESSONS_PATH]: LESSONS,
    [PREFS_PATH]: prefs,
  });
}

function renderScreen(me: MeDto, prefs: unknown = { enabled: [] }) {
  serve(me, prefs);
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationSettingsScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('NotificationSettingsScreen — шапка и состав', () => {
  it('заголовок, объяснение и «Назад» в ленту', async () => {
    renderScreen(STUDENT);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Настройки уведомлений' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Какие уведомления получать и на какое устройство.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Вернуться к уведомлениям' }),
    ).toHaveAttribute('href', '/notifications');
  });

  it('ученик — три блока сверху вниз: push, «О каких занятиях», «Что присылать»', async () => {
    renderScreen(STUDENT);

    await screen.findByRole('radio', { name: 'Обо всех занятиях школы' });
    await screen.findByRole('checkbox', { name: 'Результат экзамена' });
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Push-уведомления', 'О каких занятиях', 'Что присылать']);
  });

  it('штат — блока «О каких занятиях» нет, остальные два на месте', async () => {
    renderScreen(TEACHER);

    await screen.findByRole('checkbox', { name: 'Черновик поста' });
    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['Push-уведомления', 'Что присылать']);
    expect(mockedApiFetch).not.toHaveBeenCalledWith(LESSONS_PATH, expect.anything());
  });
});

describe('NotificationSettingsScreen — «Что присылать» по роли', () => {
  it('ученик видит свои виды, а видов учителя у него нет', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result'] });

    expect(await screen.findByText('Результат экзамена')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Придёт, когда учитель проверит вашу работу и выставит результат.',
      ),
    ).toBeInTheDocument();
    // «Черновик поста» — вид для учителя, ученику его показывать незачем.
    expect(screen.queryByText('Черновик поста')).not.toBeInTheDocument();
  });

  // ADR-0162: «Занятие отменено» — четвёртый ученический вид, включён по
  // умолчанию; штату он не положен (ни у одной роли его нет в дефолте).
  it('ученик видит «Занятие отменено» с подсказкой и включённым переключателем', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result', 'lesson_cancelled'] });

    expect(await screen.findByText('Занятие отменено')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Придёт сразу, как учитель отменит занятие, — в кабинет и push-уведомлением.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Занятие отменено' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Занятие скоро' })).not.toBeChecked();
  });

  it('учитель «Занятие отменено» не видит: отмену делает сам', async () => {
    renderScreen(TEACHER, { enabled: [] });

    expect(await screen.findByText('Черновик поста')).toBeInTheDocument();
    expect(screen.queryByText('Занятие отменено')).not.toBeInTheDocument();
  });

  // ADR-0162: «Запись занятия» — вид «по желанию». Ученик видит его выключенным,
  // хотя ни разу не переключал: в `enabled` вида нет, а в списке он есть.
  it('ученик видит «Запись занятия» с подсказкой и выключенным переключателем', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result', 'lesson_cancelled'] });

    expect(await screen.findByText('Запись занятия')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Придёт, когда учитель добавит запись занятия, — в кабинет и push-уведомлением. Обычно выключено: включите, если смотрите записи.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Запись занятия' })).not.toBeChecked();
  });

  it('учитель «Запись занятия» не видит: у штата вида «по желанию» нет', async () => {
    renderScreen(TEACHER, { enabled: [] });

    expect(await screen.findByText('Черновик поста')).toBeInTheDocument();
    expect(screen.queryByText('Запись занятия')).not.toBeInTheDocument();
  });

  // Бот и кабинет переключают одно и то же (ADR-0065) — строка про бота рядом
  // с самими переключателями. Строка зависит от botChatActive (отзыв владельца
  // 2026-09-22, регрессия — раньше рисовалась безусловно и спорила с блоком
  // «Второй способ входа» на «Профиле»).
  it('есть личный чат с ботом — подсказка про команду /notifications на месте', async () => {
    renderScreen(
      { ...STUDENT, telegramLinked: true, botChatActive: true },
      { enabled: ['exam_result'] },
    );

    expect(
      await screen.findByText(/То же самое можно переключить в боте/),
    ).toBeInTheDocument();
    // ADR-0124: команда бота выделена акцентом — RichText рисует её отдельным <strong>.
    expect(screen.getByText('/notifications').tagName).toBe('STRONG');
  });

  it('нет личного чата с ботом — подсказки про команду /notifications нет', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result'] });

    await screen.findByText('Результат экзамена');
    expect(
      screen.queryByText(/То же самое можно переключить в боте/),
    ).not.toBeInTheDocument();
  });

  // «Telegram у меня нет» — тем более нет чата с ботом, команда так же
  // недоступна (отзыв владельца 2026-09-22).
  it('отметка «Telegram у меня нет» — подсказки про команду /notifications нет', async () => {
    renderScreen({ ...STUDENT, noTelegram: true }, { enabled: ['exam_result'] });

    await screen.findByText('Результат экзамена');
    expect(
      screen.queryByText(/То же самое можно переключить в боте/),
    ).not.toBeInTheDocument();
  });

  it('включённый вид — переключатель отмечен', async () => {
    renderScreen(STUDENT, { enabled: ['exam_result'] });
    await screen.findByText('Результат экзамена');

    expect(screen.getByRole('checkbox', { name: 'Результат экзамена' })).toBeChecked();
  });

  it('выключенный вид — переключатель не отмечен', async () => {
    renderScreen(STUDENT, { enabled: [] });
    await screen.findByText('Результат экзамена');

    expect(
      screen.getByRole('checkbox', { name: 'Результат экзамена' }),
    ).not.toBeChecked();
  });
});

describe('NotificationSettingsScreen — переключение вида (read-after-write)', () => {
  it('клик шлёт PATCH с нужным телом и перерисовывает состояние из ответа', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Результат экзамена' });
    expect(toggle).not.toBeChecked();

    // PATCH /me/notifications возвращает полный NotificationPrefsDto, и экран
    // берёт состояние прямо из него (ADR-0087): путь тот же, что у GET, поэтому
    // ответ на действие — второй вызов с новым телом.
    serve(STUDENT, { enabled: ['exam_result'] });
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      PREFS_PATH,
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'exam_result', enabled: true },
      }),
    );
  });

  // «Запись занятия» включается тем же PATCH, что и любой вид: сервер хранит
  // это как override `enabled: true` сверх дефолта (ADR-0162).
  it('«Запись занятия» включается тем же PATCH и встаёт включённой из ответа', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { enabled: ['exam_result'] });
    const toggle = await screen.findByRole('checkbox', { name: 'Запись занятия' });
    expect(toggle).not.toBeChecked();

    serve(STUDENT, { enabled: ['exam_result', 'recording_ready'] });
    await user.click(toggle);

    await waitFor(() => expect(toggle).toBeChecked());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      PREFS_PATH,
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'recording_ready', enabled: true },
      }),
    );
  });

  it('ошибка сети — сообщение под списком, переключатель остаётся в прежнем положении', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Результат экзамена' });

    const message = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
    serve(STUDENT, new ApiError(message, 0, 'network'));
    await user.click(toggle);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('неопознанная ошибка (не ApiError) — общий текст, не текст исключения', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Результат экзамена' });

    serve(STUDENT, new Error('boom'));
    await user.click(toggle);

    expect(
      await screen.findByText('Не удалось изменить уведомление. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});

describe('NotificationSettingsScreen — ошибка загрузки видов', () => {
  it('баннер с кнопкой повтора вместо списка, повтор перечитывает список', async () => {
    const user = userEvent.setup();
    renderScreen(STUDENT, new Error('сеть недоступна'));

    const alert = await screen.findByRole('alert');
    const retryButton = within(alert).getByRole('button', {
      name: 'Попробовать ещё раз',
    });

    serve(STUDENT, { enabled: [] });
    await user.click(retryButton);

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('Результат экзамена')).toBeInTheDocument();
  });
});
