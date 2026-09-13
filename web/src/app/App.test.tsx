// Смоук-тест маршрутов (CLAUDE.md «Тесты»: ветвление есть — гость на /login,
// «/» уводит на /planning, docs/adr/0025-navigation-by-domain.md) — сами
// экраны и их логика проверены отдельными тестами (LoginScreen, RequireAuth,
// ScheduleScreen, PlanningScreen).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
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
  tz: 'Asia/Jerusalem',
  status: 'active',
};
const ADMIN: MeDto = {
  id: 'a1',
  name: 'Маша',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
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

    expect(await screen.findByText('Кабинет школы Сюань-Сюэ')).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Вход через Telegram не настроен. Напишите администратору школы.',
      ),
    ).toBeInTheDocument();
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

    expect(
      await screen.findByText(/Telegram-группа подключается сама/),
    ).toBeInTheDocument();
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

  // «Занятия» — ежедневный экран и один из трёх пунктов навигации
  // (navItems.ts), смоук на него обязателен.
  it('учитель на /planning — маршрут «Занятия» открывает PlanningScreen', async () => {
    mockRoute(TEACHER, { '/lessons': [], '/classes': [] });

    renderAt('/planning');

    expect(
      await screen.findByText(/Здесь занятия на 4 недели вперёд/),
    ).toBeInTheDocument();
  });

  it('учитель на /exam-items — маршрут «Вопросы для экзамена» открывает ExamItemsScreen', async () => {
    mockRoute(TEACHER, { '/exam-items': [] });

    renderAt('/exam-items');

    expect(
      await screen.findByText(/Из этих вопросов собирается экзамен/),
    ).toBeInTheDocument();
  });

  it('учитель на /exams — маршрут «Экзамены» открывает ExamsScreen', async () => {
    mockRoute(TEACHER, { '/exams': [], '/attempts': [] });

    renderAt('/exams');

    expect(await screen.findByText(/собирается из вопросов банка/)).toBeInTheDocument();
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
        rubric: [],
      },
    });

    renderAt('/grading/a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
  });

  it('admin на /people — маршрут «Ученики» открывает PeopleScreen (RequireAdmin, блокер аудита Б3)', async () => {
    mockRoute(ADMIN, { '/users': [] });

    renderAt('/people');

    expect(
      await screen.findByText(/Здесь те, кто хотя бы раз вошёл в кабинет через Telegram/),
    ).toBeInTheDocument();
  });

  it('учитель без admin на /people — уводит на «Занятия», не «Ученики»', async () => {
    mockRoute(TEACHER, { '/lessons': [], '/classes': [] });

    renderAt('/people');

    expect(
      await screen.findByText(/Здесь занятия на 4 недели вперёд/),
    ).toBeInTheDocument();
  });

  it('учитель на «/» — уводит на «Занятия»', async () => {
    mockRoute(TEACHER, { '/lessons': [], '/classes': [] });

    renderAt('/');

    expect(
      await screen.findByText(/Здесь занятия на 4 недели вперёд/),
    ).toBeInTheDocument();
  });

  // Личная настройка человека — маршрут не за RequireAdmin и не за
  // isTeacher-веткой AppShell.tsx, доступен и ученику (ТЗ notifications-web.md).
  it('учитель на /notifications — маршрут «Уведомления» открывает NotificationsScreen', async () => {
    mockRoute(TEACHER, { '/me/notifications': { enabled: [] } });

    renderAt('/notifications');

    expect(
      await screen.findByText(/В Telegram уведомления приходят в личный чат с ботом/),
    ).toBeInTheDocument();
  });

  it('ученик на /notifications — тоже открывает NotificationsScreen, не StudentScreen', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: ['student'],
      tz: 'Asia/Jerusalem',
      status: 'active',
    };
    mockRoute(student, { '/me/notifications': { enabled: [] } });

    renderAt('/notifications');

    expect(await screen.findByText('Занятие скоро')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет для учителя.')).not.toBeInTheDocument();
  });

  // Экран сдачи (ТЗ student-exams.md) — доступен любой роли, вход не за
  // ролевым гвардом, как «/notifications» чуть выше.
  it('ученик на /attempts/:id — открывает экран сдачи, не StudentScreen', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: ['student'],
      tz: 'Asia/Jerusalem',
      status: 'active',
    };
    mockRoute(student, {
      '/attempts': [
        {
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
      ],
    });

    renderAt('/attempts/a1');

    expect(await screen.findByText('Форма первого уровня')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет для учителя.')).not.toBeInTheDocument();
  });

  it('неизвестный путь для гостя — тоже уводит на экран входа (через «/»)', async () => {
    mockRoute(null);

    renderAt('/что-то-неизвестное');

    expect(await screen.findByText('Кабинет школы Сюань-Сюэ')).toBeInTheDocument();
  });
});
