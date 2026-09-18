// Экран «Занятия» ученика — второй экран (решение владельца, первый —
// «Задания»/TasksScreen.tsx): приветствие по имени, заголовок раздела и
// ссылка на сайт школы поверх списка занятий (проверки состояний —
// StudentLessonsScreen.test.tsx). Три запроса (/auth/me, /auth/config,
// /me/lessons) — mockApiByPath; /me/exams сюда не входит — экзамены больше
// не заходят на этот экран (StudentExamsSection переехал в TasksScreen.tsx).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import LessonsScreen from './LessonsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STUDENT: MeDto = {
  id: 's1',
  name: 'Мария',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  needsProfile: false,
};

function renderScreen(config: Record<string, unknown>, me: MeDto | Error = STUDENT) {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': config,
    '/me/lessons': [],
  });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LessonsScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('LessonsScreen', () => {
  it('здоровается по имени и называет раздел заголовком', async () => {
    renderScreen({});

    expect(await screen.findByText('Здравствуйте, Мария')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Ближайшее занятие' }),
    ).toBeInTheDocument();
    // Чей это час — сказано прямо: школа может жить в другом поясе
    // (CLAUDE.md «Время»).
    expect(screen.getByText('Время — по вашим часам.')).toBeInTheDocument();
  });

  it('имени ещё нет — здороваемся без него, без прочерка', async () => {
    renderScreen({}, new Error('нет сессии'));

    expect(await screen.findByText('Здравствуйте')).toBeInTheDocument();
  });

  it('учитель заполнил адрес сайта школы — ссылка ниже расписания', async () => {
    renderScreen({ schoolSiteUrl: 'https://xuanxue.su' });

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'https://xuanxue.su' })).toHaveAttribute(
      'href',
      'https://xuanxue.su',
    );
  });

  it('без адреса сайта школы — без ссылки на сайт (карточка архива остаётся)', async () => {
    renderScreen({});

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /https:\/\// })).not.toBeInTheDocument();
  });

  it('блока экзаменов на экране нет — «Задания» переехали на свой маршрут', async () => {
    renderScreen({});

    await screen.findByText('Ближайших занятий пока нет.');
    expect(screen.queryByText('Экзамены')).not.toBeInTheDocument();
    expect(screen.queryByText('Экзаменов пока нет.')).not.toBeInTheDocument();
  });

  // Слой 3.3 (docs/PLAN.md §14) — карточка входа в архив под списком
  // ближайших занятий, не пункт меню (ADR-0025).
  it('карточка «Записи занятий» ведёт на /archive', async () => {
    renderScreen({});

    await screen.findByText('Ближайших занятий пока нет.');
    expect(screen.getByRole('link', { name: /Записи занятий/ })).toHaveAttribute(
      'href',
      '/archive',
    );
  });
});
