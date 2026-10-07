// Смоук-тест маршрутов (CLAUDE.md «Тесты»: ветвление есть — гость на /login,
// «/» уводит всех на /board: штат — на доску штата (ADR-0174, было /exams —
// ADR-0138), ученик — на свою доску (ADR-0173, раньше /tasks — ADR-0046),
// docs/adr/0025-navigation-by-domain.md) — сами экраны и их логика проверены
// отдельными тестами (LoginScreen, RequireAuth, ScheduleScreen,
// PlanningScreen, ExamsScreen, BoardScreen).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NEWCOMER_CONTACT,
  DEFAULT_PAYMENT_CONTACT,
  DEFAULT_PAYMENT_REMINDER,
  type MeDto,
  type SettingsDto,
} from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import App from './App';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
  googleLinked: false,
  studentMode: false,
  canUseStudentMode: false,
};
const ACCOUNTANT: MeDto = {
  id: 'b1',
  name: 'Оля',
  roles: ['accountant'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
  googleLinked: false,
  studentMode: false,
  canUseStudentMode: false,
};
const ADMIN: MeDto = {
  id: 'a1',
  name: 'Маша',
  roles: ['admin'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
  googleLinked: false,
  studentMode: false,
  canUseStudentMode: false,
};

/** Заглушка сети для одного маршрута: сессия и конфигурация входа одинаковы во
 * всех тестах файла, различается только то, что отдаёт сам экран. Раньше этот
 * блок был скопирован в каждый тест — jscpd поймал (CLAUDE.md «Дубли»). */
function mockRoute(me: MeDto | null, screenData: Record<string, unknown> = {}) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/auth/me') {
      return me ? Promise.resolve(me) : Promise.reject(new Error('нет сессии'));
    }
    const prefix = Object.keys(screenData).find((key) => path.startsWith(key));
    if (prefix) return Promise.resolve(screenData[prefix]);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
}

/** Минимальные настройки школы: доска штата читает `GET /settings` целиком,
 * объявление ученикам правится прямо с доски (ADR-0172, дополнение 2026-10-07). */
const SETTINGS: SettingsDto = {
  templates: { lesson_link: '', recording: '' },
  tz: 'Asia/Jerusalem',
  previewMinutes: 5,
  lessonReminderMinutes: 60,
  newcomerContact: DEFAULT_NEWCOMER_CONTACT,
  paymentContact: DEFAULT_PAYMENT_CONTACT,
  paymentReminder: DEFAULT_PAYMENT_REMINDER,
  updatedAt: '2026-10-06T10:00:00.000Z',
};

/** Данные доски штата (ADR-0174): настройки школы с объявлением и очередь
 * проверки. `/attempts/queue` ловит и путь с query — mockRoute матчит по префиксу. */
const STAFF_BOARD_DATA = { '/settings': SETTINGS, '/attempts/queue': [] };

/** Данные четырёх запросов «Доски» (ADR-0173) — первого экрана ученика. */
const STUDENT_BOARD_DATA = {
  '/me/exams': [],
  '/me/lessons': [],
  '/me/board': { notice: null },
  '/me/payments': { month: '2026-10', rows: [], contact: 'Маше' },
};

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App', () => {
  it('гость на «/» — попадает на экран входа', async () => {
    mockRoute(null);

    renderAt('/');

    expect(await screen.findByText('Кабинет школы')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Вход через Telegram не настроен. Напишите администратору школы.',
      ),
    ).toBeInTheDocument();
  });

  it('гость на /login/email без токена — маршрут открывает EmailLoginCallbackScreen (ADR-0029)', async () => {
    mockRoute(null);

    renderAt('/login/email');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
  });

  it('гость на /login/google без code/state — маршрут открывает GoogleLoginCallbackScreen (ADR-0145)', async () => {
    mockRoute(null);

    renderAt('/login/google');

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
  });

  it('гость на /privacy — маршрут открывает PrivacyScreen, без входа', async () => {
    mockRoute(null);

    renderAt('/privacy');

    expect(
      await screen.findByRole('heading', { name: 'Политика конфиденциальности' }),
    ).toBeInTheDocument();
  });

  it('вошедший на /privacy — маршрут тоже открывает PrivacyScreen, без редиректа', async () => {
    mockRoute(TEACHER, STAFF_BOARD_DATA);

    renderAt('/privacy');

    expect(
      await screen.findByRole('heading', { name: 'Политика конфиденциальности' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Доска' })).not.toBeInTheDocument();
  });

  // Заявление о доступности (ADR-0158) — публичное, как политика: правила
  // требуют держать его на виду у всех, а не только у вошедших.
  it('гость на /accessibility — маршрут открывает AccessibilityScreen, без входа', async () => {
    mockRoute(null);

    renderAt('/accessibility');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доступность' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Кабинет школы')).not.toBeInTheDocument();
  });

  it('вошедший на /accessibility — маршрут тоже открывает AccessibilityScreen, без редиректа', async () => {
    mockRoute(TEACHER, STAFF_BOARD_DATA);

    renderAt('/accessibility');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доступность' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Доска' })).not.toBeInTheDocument();
  });

  it('учитель на /schedule — маршрут «Расписание» открывает ScheduleScreen', async () => {
    mockRoute(TEACHER, { '/classes': [], '/channels': [], '/users/teachers': [] });

    renderAt('/schedule');

    expect(
      await screen.findByRole('button', { name: 'Добавить занятие' }),
    ).toBeInTheDocument();
  });

  it('учитель на /channels — маршрут «Каналы» открывает ChannelsScreen (ревью п.17)', async () => {
    mockRoute(TEACHER, { '/channels': [] });

    renderAt('/channels');

    expect(await screen.findByRole('heading', { name: 'Каналы' })).toBeInTheDocument();
  });

  it('учитель на /broadcasts — маршрут «Рассылки» открывает BroadcastsScreen (pr-k3-fixes.md п.20)', async () => {
    mockRoute(TEACHER, {
      '/broadcasts': [],
      '/deliveries': [],
      '/channels': [],
      // Числа за 30 дней вверху экрана (BroadcastsSummary.tsx) — эндпоинт
      // /summary остаётся в API и без своего экрана (docs/adr/0025).
      '/summary': { emptyMessage: 'Пока нечего показать.' },
    });

    renderAt('/broadcasts');

    expect(
      await screen.findByRole('button', { name: 'Новая рассылка' }),
    ).toBeInTheDocument();
  });

  it('учитель на /templates — маршрут «Шаблоны» открывает TemplatesScreen (pr-k3-fixes.md п.20)', async () => {
    mockRoute(TEACHER, {
      '/settings': {
        templates: { lesson_link: 'Анонс', recording: 'Запись' },
        tz: 'Asia/Jerusalem',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      '/lessons': [],
    });

    renderAt('/templates');

    expect(
      await screen.findByRole('heading', { name: 'Анонс занятия' }),
    ).toBeInTheDocument();
  });

  it('учитель на /school — маршрут «Школа» открывает SchoolScreen (ADR-0176)', async () => {
    mockRoute(TEACHER, {
      '/settings': SETTINGS,
      '/notifications/lesson-prefs-stats': {
        activeStudents: 0,
        chosenClasses: 0,
        ownReminder: 0,
      },
    });

    renderAt('/school');

    expect(
      await screen.findByRole('heading', { name: 'Школа', level: 1 }),
    ).toBeInTheDocument();
  });

  // «Занятия» — ежедневный экран и один из трёх пунктов навигации
  // (navItems.ts), смоук на него обязателен.
  it('учитель на /planning — маршрут «Занятия» открывает PlanningScreen', async () => {
    mockRoute(TEACHER, { '/lessons': [], '/classes': [] });

    renderAt('/planning');

    // «4 недели» — акцент через RichText (<strong>, ADR-0124): сверяем по
    // textContent абзаца, а не по прямым текстовым узлам.
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' && !!el.textContent?.includes('Занятия на 4 недели вперёд'),
      ),
    ).toBeInTheDocument();
  });

  it('учитель на /planning/new — маршрут страницы разового занятия (ADR-0033)', async () => {
    mockRoute(TEACHER, { '/classes': [], '/users/teachers': [] });

    renderAt('/planning/new');

    expect(
      await screen.findByRole('heading', { name: 'Разовое занятие' }),
    ).toBeInTheDocument();
  });

  it('учитель на /schedule/new — маршрут страницы занятия расписания (ADR-0033)', async () => {
    mockRoute(TEACHER, { '/channels': [], '/users/teachers': [] });

    renderAt('/schedule/new');

    expect(
      await screen.findByRole('heading', { name: 'Новое занятие в расписании' }),
    ).toBeInTheDocument();
  });

  it('учитель на /exam-items — маршрут «Вопросы для экзамена» открывает ExamItemsScreen', async () => {
    mockRoute(TEACHER, { '/exam-items': [] });

    renderAt('/exam-items');

    expect(await screen.findByRole('heading', { name: 'Вопросы' })).toBeInTheDocument();
  });

  it('учитель на /exam-items/new — маршрут страницы вопроса (ADR-0033)', async () => {
    mockRoute(TEACHER, { '/exam-items': [] });

    renderAt('/exam-items/new');

    expect(
      await screen.findByRole('heading', { name: 'Новый вопрос' }),
    ).toBeInTheDocument();
  });

  it('учитель на /exams — маршрут «Экзамены» открывает ExamsScreen', async () => {
    mockRoute(TEACHER, { '/exams': [], '/attempts': [] });

    renderAt('/exams');

    expect(await screen.findByRole('heading', { name: 'Экзамены' })).toBeInTheDocument();
  });

  it('учитель на /exams/new — маршрут редактора экзамена (ADR-0033)', async () => {
    mockRoute(TEACHER, { '/exam-items': [] });

    renderAt('/exams/new');

    expect(
      await screen.findByRole('heading', { name: 'Новый экзамен' }),
    ).toBeInTheDocument();
  });

  it('учитель на /grading — маршрут «Проверка работ» открывает GradingQueueScreen', async () => {
    mockRoute(TEACHER, { '/attempts': [] });

    renderAt('/grading');

    expect(
      await screen.findByText('Пока нечего проверять — сданных работ нет.'),
    ).toBeInTheDocument();
  });

  it('учитель на /grading/:attemptId — открывается карточка проверки работы', async () => {
    mockRoute(TEACHER, {
      '/attempts/a1/review': {
        attemptId: 'a1',
        examId: 'e1',
        examTitle: 'Форма первого уровня',
        userId: 'u1',
        userName: 'Иван Иванов',
        status: 'submitted',
        blocks: [],
      },
    });

    renderAt('/grading/a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  it('admin на /people — маршрут «Ученики» открывает PeopleScreen (RequirePeopleAccess, блокер аудита Б3)', async () => {
    mockRoute(ADMIN, { '/users': [], '/users/invite-link': { url: null } });

    renderAt('/people');

    expect(
      await screen.findByText(/зарегистрировался по ссылке-приглашению/),
    ).toBeInTheDocument();
  });

  // ADR-0030 (уточнение владельца 2026-09-15): ссылку-приглашение отдаёт и
  // учитель — маршрут открыт ему, но список учеников остаётся admin
  // (SECURITY §3), PeopleScreen сам не зовёт GET /users для teacher.
  it('учитель на /people — видит карточку ссылки, не список учеников', async () => {
    mockRoute(TEACHER, { '/users/invite-link': { url: null } });

    renderAt('/people');

    expect(await screen.findByText('Ссылка-приглашение')).toBeInTheDocument();
  });

  // ADR-0171: бухгалтер без ролей штата входит сразу в «Оплаты».
  it('бухгалтер на «/» — попадает на «Оплаты» (корень бухгалтера)', async () => {
    mockRoute(ACCOUNTANT, { '/payments': { month: '2026-09', rows: [] } });

    renderAt('/');

    expect(await screen.findByRole('heading', { name: 'Оплаты' })).toBeInTheDocument();
  });

  it('admin на /payments — маршрут открывает PaymentsScreen', async () => {
    mockRoute(ADMIN, { '/payments': { month: '2026-09', rows: [] } });

    renderAt('/payments');

    expect(await screen.findByRole('heading', { name: 'Оплаты' })).toBeInTheDocument();
  });

  it('учитель на /payments — уходит на свой корень «Доска», а не получает отказ API', async () => {
    mockRoute(TEACHER, STAFF_BOARD_DATA);

    renderAt('/payments');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Оплаты' })).not.toBeInTheDocument();
  });

  it('ученик без роли на /people — уводит редиректом на «Доску» (маршрут штата ему не открыт)', async () => {
    // AppShell.tsx: canSeeRoute не пускает ученика на маршруты штата вовсе —
    // редирект на rootPathFor(me) срабатывает раньше, чем запрос доходит до
    // вложенного RequirePeopleAccess.
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student, STUDENT_BOARD_DATA);

    renderAt('/people');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Ученики')).not.toBeInTheDocument();
  });

  // Журнал сбоев (ADR-0132) — только admin (RequireDevErrorsAccess.tsx),
  // вход карточкой на «Профиле», не пункт меню (ADR-0025).
  it('admin на /dev/errors — маршрут «Сбои» открывает DevErrorsScreen', async () => {
    mockRoute(ADMIN, { '/dev/errors': { items: [], last24h: 0 } });

    renderAt('/dev/errors');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Сбои' }),
    ).toBeInTheDocument();
  });

  it('учитель на /dev/errors — уводит редиректом на «Занятия» (RequireDevErrorsAccess)', async () => {
    mockRoute(TEACHER, { '/lessons': [], '/classes': [] });

    renderAt('/dev/errors');

    // «4 недели» — тот же смоук, что у /planning выше (PlanningScreen.tsx).
    expect(
      await screen.findByText(
        (_, el) =>
          el?.tagName === 'P' && !!el.textContent?.includes('Занятия на 4 недели вперёд'),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Сбои')).not.toBeInTheDocument();
  });

  it('ученик без роли на /dev/errors — уводит редиректом на «Доску» (маршрут штата ему не открыт)', async () => {
    const student: MeDto = {
      id: 's2',
      name: 'Оля',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student, STUDENT_BOARD_DATA);

    renderAt('/dev/errors');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Сбои')).not.toBeInTheDocument();
  });

  // Решение владельца 2026-10-06 (ADR-0174, заменяет ADR-0138): «Доска» —
  // первый экран штата при входе, было «Экзамены» — смоук на /exams отдельно
  // выше, здесь только то, что «/» ведёт на доску и в ней есть входы в
  // расписание, рассылки и материалы.
  it('учитель на «/» — уводит на «Доску»', async () => {
    mockRoute(TEACHER, STAFF_BOARD_DATA);

    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Расписание/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Рассылки/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Материалы/ })).toBeInTheDocument();
  });

  // Решение владельца 2026-10-06 (ADR-0173): «Доска» — первый экран ученика —
  // ученик с «/» попадает не туда же, куда учитель.
  it('ученик на «/» — уводит на «Доску»', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student, STUDENT_BOARD_DATA);

    renderAt('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
  });

  it('ученик на /board — маршрут «Доска» открывает BoardScreen', async () => {
    const student: MeDto = { ...TEACHER, id: 's3', name: 'Катя', roles: [] };
    mockRoute(student, STUDENT_BOARD_DATA);

    renderAt('/board');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Доска' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Экзаменов к сдаче нет.')).toBeInTheDocument();
  });

  it('ученик на /tasks — маршрут «Задания» открывает TasksScreen', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student, { '/me/exams': [] });

    renderAt('/tasks');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Задания' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Заданий пока нет.')).toBeInTheDocument();
  });

  it('ученик на /lessons — маршрут «Занятия» открывает LessonsScreen', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student, { '/me/lessons': [] });

    renderAt('/lessons');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ближайшее занятие' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
  });

  // Личный экран человека — маршрут не за RequirePeopleAccess и открыт любой
  // роли в canSeeRoute (screenAccess.ts), доступен и ученику (ADR-0045).
  it('учитель на /profile — маршрут «Профиль» открывает ProfileScreen', async () => {
    mockRoute(TEACHER);

    renderAt('/profile');

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeInTheDocument();
  });

  it('ученик на /profile — маршрут ему открыт, как и штату', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student);

    renderAt('/profile');

    // Переключатели видов переехали на свой экран (ADR-0162) — на «Профиле»
    // остался вход в него.
    // В оболочке есть и свой значок «Уведомления» (лента) — карточку называет
    // её приписка.
    expect(
      await screen.findByRole('link', { name: /Что присылать, о каких занятиях/ }),
    ).toHaveAttribute('href', '/notifications/settings');
  });

  // «Настройки уведомлений» (ADR-0162) — подэкран ленты, открыт любой роли:
  // учитель не уходит с него редиректом на «/board», ученик попадает на него,
  // а не на «Задания». Узкий путь раньше широкого — mockRoute берёт первое
  // совпадение по префиксу.
  it('учитель на /notifications/settings — открывается экран настроек, а не редирект на «/board»', async () => {
    mockRoute(TEACHER, {
      '/me/notifications': { enabled: [] },
      '/push/public-key': { publicKey: null },
    });

    renderAt('/notifications/settings');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Настройки уведомлений' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Что присылать')).toBeInTheDocument();
    expect(screen.queryByText('О каких занятиях')).not.toBeInTheDocument();
  });

  it('ученик на /notifications/settings — экран настроек с выбором занятий', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    mockRoute(student, {
      '/me/notifications/lessons': { scope: { mode: 'all', classIds: [] }, classes: [] },
      '/me/notifications': { enabled: [] },
      '/push/public-key': { publicKey: null },
    });

    renderAt('/notifications/settings');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Настройки уведомлений' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Результат экзамена')).toBeInTheDocument();
    expect(await screen.findByText('О каких занятиях')).toBeInTheDocument();
  });

  // Экран сдачи (ТЗ student-exams.md) — доступен любой роли, вход не за
  // ролевым гвардом, как «/profile» чуть выше.
  it('ученик на /attempts/:id — открывает экран сдачи, маршрут ему открыт', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
      googleLinked: false,
      studentMode: false,
      canUseStudentMode: false,
    };
    // Своя попытка своим адресом, не список (ADR-0126).
    mockRoute(student, {
      '/attempts/a1': {
        id: 'a1',
        examId: 'e1',
        examTitle: 'Форма первого уровня',
        userId: 's1',
        status: 'in_progress',
        blocks: [],
        answers: [],
        startedAt: '2026-09-01T00:00:00Z',
        expired: false,
      },
    });

    renderAt('/attempts/a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  it('гость на /join/:code с действующим кодом — маршрут открывает JoinScreen (ADR-0030)', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me') return Promise.reject(new Error('нет сессии'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: true });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderAt(`/join/${'a'.repeat(32)}`);

    expect(await screen.findByText('Вас пригласили в школу')).toBeInTheDocument();
  });

  it('гость на /join/:code с недействующим кодом — «Ссылка не подошла»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/me') return Promise.reject(new Error('нет сессии'));
      if (path === '/auth/join/check') return Promise.resolve({ valid: false });
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    renderAt(`/join/${'a'.repeat(32)}`);

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
  });

  // ADR-0044 «Мягкий первый вход»: маршрут живёт за RequireAuth, но вне
  // AppShell (App.tsx) — здесь смоук на реальный WelcomeScreen внутри всего
  // дерева App, детали формы и редиректа — RequireAuth.test.tsx и
  // welcome/WelcomeScreen.test.tsx.
  it('не назвавшийся (needsProfile) на /welcome — форма имени, без оболочки кабинета', async () => {
    mockRoute({ ...TEACHER, name: 'Новый ученик', needsProfile: true });

    renderAt('/welcome');

    expect(await screen.findByText('Как вас зовут?')).toBeInTheDocument();
    expect(screen.queryByText('Занятия')).not.toBeInTheDocument();
  });

  it('неизвестный путь для гостя — тоже уводит на экран входа (через «/»)', async () => {
    mockRoute(null);

    renderAt('/что-то-неизвестное');

    expect(await screen.findByText('Кабинет школы')).toBeInTheDocument();
  });
});
