// Экран «Занятия» ученика — второй экран (решение владельца, первый —
// «Задания»/TasksScreen.tsx): приветствие по имени, заголовок раздела и
// ссылка на сайт школы поверх списка занятий (проверки состояний —
// StudentLessonsScreen.test.tsx). Три запроса (/auth/me, /auth/config,
// /me/lessons) — mockApiByPath; /me/exams сюда не входит — экзамены больше
// не заходят на этот экран (StudentExamsSection переехал в TasksScreen.tsx).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto, MyLessonDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import LessonsScreen from './LessonsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();
stubViewerTimeZone();

const STUDENT: MeDto = {
  id: 's1',
  name: 'Мария',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

function makeLesson(overrides: Partial<MyLessonDto> = {}): MyLessonDto {
  return {
    id: 'l1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    classTitle: 'Тайцзицюань',
    groupLabel: 'Средняя группа',
    format: 'online',
    zoomLink: 'https://zoom.us/j/123',
    topic: '',
    status: 'scheduled',
    tags: [],
    ...overrides,
  };
}

function renderScreen(
  config: Record<string, unknown>,
  me: MeDto | Error = STUDENT,
  lessons: MyLessonDto[] = [],
) {
  mockApiByPath({
    '/auth/me': me,
    '/auth/config': config,
    '/me/lessons': lessons,
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

  // Слой 3.3 (docs/PLAN.md §14) — карточка входа в архив, не пункт меню
  // (ADR-0025).
  it('карточка «Записи занятий» ведёт на /archive', async () => {
    renderScreen({});

    await screen.findByText('Ближайших занятий пока нет.');
    expect(screen.getByRole('link', { name: /Записи занятий/ })).toHaveAttribute(
      'href',
      '/archive',
    );
  });

  // Слой 3.2 (docs/PLAN.md §14) — вторая карточка входа, библиотека
  // материалов школы, не пункт меню (ADR-0025).
  it('карточка «Библиотека» ведёт на /library', async () => {
    renderScreen({});

    await screen.findByText('Ближайших занятий пока нет.');
    expect(screen.getByRole('link', { name: /Библиотека/ })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  // Отзыв владельца 2026-09-22: карточки стояли в подвале, под списком
  // будущих занятий, — длинный список сносил их вниз экрана, и ученик их не
  // видел. Теперь они в `afterNextLesson` (StudentLessonsScreen.tsx), сразу
  // под ближайшим занятием и выше «Дальше» — проверяем порядок в DOM, а не
  // просто присутствие обеих карточек.
  it('карточка «Записи занятий» стоит в DOM выше блока «Дальше»', async () => {
    renderScreen({}, STUDENT, [
      makeLesson({ id: 'l1', startsAt: '2026-09-08T16:00:00.000Z' }),
      makeLesson({ id: 'l2', startsAt: '2026-09-15T16:00:00.000Z' }),
    ]);

    const archiveLink = await screen.findByRole('link', { name: /Записи занятий/ });
    const laterHeading = screen.getByRole('heading', { level: 2, name: 'Дальше' });

    // DOCUMENT_POSITION_FOLLOWING — laterHeading идёт в DOM после archiveLink.
    const position = archiveLink.compareDocumentPosition(laterHeading);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
