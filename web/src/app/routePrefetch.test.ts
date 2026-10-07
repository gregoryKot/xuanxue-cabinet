// Тест таблицы предзагрузки данных первого экрана (routeModules.ts,
// prefetchFirstScreen.ts) — отдельно от matchRoute (routeModules.test.ts):
// здесь важно не какой чанк выбран, а какие пути строятся для него.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSES_LIST_PATH,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  INVITE_LINK_PATH,
  LESSON_RECORDING_SUMMARY_PATH,
  MY_EXAMS_PATH,
  MY_LESSONS_ARCHIVE_PATH,
  MY_LESSONS_PATH,
  MY_MATERIALS_PATH,
  NOTIFICATIONS_FEED_PATH,
  NOTIFICATION_PREFS_PATH,
  SETTINGS_PATH,
  TEACHERS_PATH,
  channelsListPath,
  EXAM_EDITOR_ITEMS_PATH,
  examItemsListPath,
  examsListPath,
  lessonsListPath,
  materialsListPath,
  nextLessonsPath,
} from '../api/apiPaths';
import {
  GRADED_ATTEMPTS_PATH,
  GRADING_QUEUE_PATH,
  attemptPath,
} from '../api/gradingPaths';
import { MY_LESSON_NOTIFICATIONS_PATH } from '../api/lessonScopePaths';
import { MY_PAYMENTS_PATH, paymentsListPath } from '../api/paymentsApiPaths';
import { MY_BOARD_PATH } from '../api/boardApiPaths';
import { MY_EVENTS_PATH, SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import { TAGS_LIST_PATH } from '../api/tagsApiPaths';
import { matchRoute } from './routeMatch';

function prefetchAt(pathname: string): string[] {
  return matchRoute(pathname)?.prefetch?.(pathname) ?? [];
}

// Пути с окном времени (`lessonsListPath`, `nextLessonsPath`) считаются от
// «сейчас» — и в таблице, и в ожидании теста, но в разные моменты. Часы
// заморожены, чтобы сравнение не зависело от того, успела ли между двумя
// вызовами смениться минута или неделя (CLAUDE.md «Детерминизм»; CI поймал
// расхождение в одну миллисекунду на `/templates` до округления окна).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-16T12:00:37.421Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RouteModule.prefetch — маршруты без параметра', () => {
  it('/planning — занятия на окно, классы и число раздела (слой 3.5)', () => {
    expect(prefetchAt('/planning')).toEqual([
      lessonsListPath(),
      CLASSES_LIST_PATH,
      LESSON_RECORDING_SUMMARY_PATH,
    ]);
  });

  it('/schedule — классы и активные каналы (оба грузит ScheduleScreen.tsx)', () => {
    expect(prefetchAt('/schedule')).toEqual([CLASSES_LIST_PATH, channelsListPath(true)]);
  });

  it('/channels — список всех каналов', () => {
    expect(prefetchAt('/channels')).toEqual([channelsListPath(false)]);
  });

  it('/materials — список без фильтра и классы (рубрикация строки)', () => {
    expect(prefetchAt('/materials')).toEqual([materialsListPath(''), CLASSES_LIST_PATH]);
  });

  // Экран тега (ADR-0075/0078): тег — query-параметр, недоступный
  // prefetch(pathname), поэтому греем только то, что не зависит от выбора —
  // сводку тегов и классы для рубрикации строк (тот же приём, что у
  // /materials выше).
  it('/materials/tags — сводка тегов и классы, без выбранного тега', () => {
    expect(prefetchAt('/materials/tags')).toEqual([TAGS_LIST_PATH, CLASSES_LIST_PATH]);
  });

  it('/templates — настройки и ближайшие занятия для предпросмотра', () => {
    expect(prefetchAt('/templates')).toEqual([SETTINGS_PATH, nextLessonsPath()]);
  });

  // Тот же GET /settings, что у «Шаблонов», плюс число «сколько учеников
  // выбрали своё время напоминания» под полем (ADR-0176).
  it('/school — настройки школы и число выбравших своё напоминание', () => {
    expect(prefetchAt('/school')).toEqual([
      SETTINGS_PATH,
      '/notifications/lesson-prefs-stats',
    ]);
  });

  it('/exam-items — вопросы без фильтра', () => {
    expect(prefetchAt('/exam-items')).toEqual([examItemsListPath('')]);
  });

  it('/exams — список без фильтра, очередь проверки, статистика вопросов', () => {
    expect(prefetchAt('/exams')).toEqual([
      examsListPath({ status: '' }),
      GRADING_QUEUE_PATH,
      EXAM_ITEM_STATS_SUMMARY_PATH,
    ]);
  });

  it('/grading — оба раздела: очередь и проверенные', () => {
    expect(prefetchAt('/grading')).toEqual([GRADING_QUEUE_PATH, GRADED_ATTEMPTS_PATH]);
  });

  // «Профиль» больше не показывает переключатели уведомлений (ADR-0162) — за
  // ними он в сеть не ходит, греть нечего.
  it('/profile — данных первого экрана нет', () => {
    expect(prefetchAt('/profile')).toEqual([]);
  });

  it('/notifications/settings — виды уведомлений и список занятий для выбора', () => {
    expect(prefetchAt('/notifications/settings')).toEqual([
      NOTIFICATION_PREFS_PATH,
      MY_LESSON_NOTIFICATIONS_PATH,
    ]);
  });

  it('/notifications — лента, список своих экзаменов (новые задания) и занятия (подсказка «выберите свои»)', () => {
    expect(prefetchAt('/notifications')).toEqual([
      NOTIFICATIONS_FEED_PATH,
      MY_EXAMS_PATH,
      MY_LESSON_NOTIFICATIONS_PATH,
    ]);
  });

  // «Доска» (ADR-0173, у штата — ADR-0174): запись таблицы одна на обе
  // роли, поэтому греет объединение: экзамены, занятия, оплата и объявление
  // ученика плюс настройки школы (объявление штат правит с доски, ADR-0172,
  // дополнение 2026-10-07) и очередь проверки штата. Лишнее для роли отсекает
  // firstScreenPaths (prefetchFirstScreen.test.ts), а «/» с ADR-0174 ведёт
  // сюда же — гейт от повторного расхождения EMPTY_PATH_FALLBACK
  // (routeMatch.ts) и rootPathFor (screenAccess.ts).
  it('/board (и /) — запросы обеих досок, включая события ученика и штата', () => {
    const expected = [
      MY_EXAMS_PATH,
      MY_LESSONS_PATH,
      MY_PAYMENTS_PATH,
      MY_BOARD_PATH,
      SETTINGS_PATH,
      GRADING_QUEUE_PATH,
      MY_EVENTS_PATH,
      SCHOOL_EVENTS_PATH,
    ];
    expect(prefetchAt('/board')).toEqual(expected);
    expect(prefetchAt('/')).toEqual(expected);
  });

  // Решение владельца: экзамены — отдельный экран (docs/PLAN.md §11).
  it('/tasks — список своих экзаменов', () => {
    expect(prefetchAt('/tasks')).toEqual([MY_EXAMS_PATH]);
  });

  it('/lessons — список своих занятий', () => {
    expect(prefetchAt('/lessons')).toEqual([MY_LESSONS_PATH]);
  });

  it('/archive — список прошедших занятий с записями', () => {
    expect(prefetchAt('/archive')).toEqual([MY_LESSONS_ARCHIVE_PATH]);
  });

  it('/library — библиотека материалов ученика', () => {
    expect(prefetchAt('/library')).toEqual([MY_MATERIALS_PATH]);
  });

  it('/payments — список оплат текущего месяца (месяц называет сервер)', () => {
    expect(prefetchAt('/payments')).toEqual([paymentsListPath(null)]);
  });

  it('/people — ссылка-приглашение; список учеников (GET /users) не греем — он только для admin', () => {
    expect(prefetchAt('/people')).toEqual([INVITE_LINK_PATH]);
  });
});

describe('RouteModule.prefetch — «новая запись»: своего id нет, читать нечего', () => {
  it('/schedule/new — активные каналы и учителя (форма ждёт их и для новой записи)', () => {
    expect(prefetchAt('/schedule/new')).toEqual([channelsListPath(true), TEACHERS_PATH]);
  });

  it('/planning/new — список классов и учителя', () => {
    expect(prefetchAt('/planning/new')).toEqual([CLASSES_LIST_PATH, TEACHERS_PATH]);
  });

  // Вместе с удалёнными из банка (ADR-0140): экран запросит тот же путь.
  it('/exams/new — вопросы без фильтра, вместе с удалёнными из банка', () => {
    expect(prefetchAt('/exams/new')).toEqual([EXAM_EDITOR_ITEMS_PATH]);
  });

  it('/channels/new и /exam-items/new — форма не ждёт ничего кроме себя, prefetch не задан', () => {
    expect(prefetchAt('/channels/new')).toEqual([]);
    expect(prefetchAt('/exam-items/new')).toEqual([]);
  });

  it('/materials/new — форма ждёт занятия расписания для привязки галочками', () => {
    expect(prefetchAt('/materials/new')).toEqual([CLASSES_LIST_PATH]);
  });
});

describe('RouteModule.prefetch — редактор существующей записи: карточка по id из адреса', () => {
  it('/schedule/:id — карточка занятия расписания, активные каналы, учителя', () => {
    expect(prefetchAt('/schedule/652f00000000000000000004')).toEqual([
      '/classes/652f00000000000000000004',
      channelsListPath(true),
      TEACHERS_PATH,
    ]);
  });

  it('хвостовой слеш не попадает в id: /schedule/:id/ — та же карточка', () => {
    expect(prefetchAt('/schedule/652f00000000000000000004/')[0]).toBe(
      '/classes/652f00000000000000000004',
    );
  });

  it('/planning/:id — карточка занятия, список классов, учителя', () => {
    expect(prefetchAt('/planning/652f00000000000000000003')).toEqual([
      '/lessons/652f00000000000000000003',
      CLASSES_LIST_PATH,
      TEACHERS_PATH,
    ]);
  });

  it('/channels/:id — карточка канала', () => {
    expect(prefetchAt('/channels/652f00000000000000000005')).toEqual([
      '/channels/652f00000000000000000005',
    ]);
  });

  it('/materials/:id — карточка материала и занятия расписания', () => {
    expect(prefetchAt('/materials/652f00000000000000000008')).toEqual([
      '/materials/652f00000000000000000008',
      CLASSES_LIST_PATH,
    ]);
  });

  // ADR-0177: одиночного GET у события нет, правка находит его в списке штата.
  it('/events/new — читать нечего, /events/:id — список событий штата', () => {
    expect(prefetchAt('/events/new')).toEqual([]);
    expect(prefetchAt('/events/652f00000000000000000009')).toEqual([SCHOOL_EVENTS_PATH]);
  });

  it('/exams/:id — карточка экзамена и вопросы, вместе с удалёнными из банка (ADR-0140)', () => {
    expect(prefetchAt('/exams/652f00000000000000000006')).toEqual([
      '/exams/652f00000000000000000006',
      EXAM_EDITOR_ITEMS_PATH,
    ]);
  });

  it('/exams/:id/preview — те же карточка экзамена и вопросы, id берётся перед хвостом', () => {
    expect(prefetchAt('/exams/652f00000000000000000006/preview')).toEqual([
      '/exams/652f00000000000000000006',
      EXAM_EDITOR_ITEMS_PATH,
    ]);
  });

  it('/exam-items/:id — карточка вопроса', () => {
    expect(prefetchAt('/exam-items/652f00000000000000000007')).toEqual([
      '/exam-items/652f00000000000000000007',
    ]);
  });

  it('/grading/:id — карточка проверки этой попытки', () => {
    expect(prefetchAt('/grading/abc')).toEqual(['/attempts/abc/review']);
  });

  it('/attempts/:id — своя попытка своим адресом (ADR-0126)', () => {
    expect(prefetchAt('/attempts/652f00000000000000000001')).toEqual([
      attemptPath('652f00000000000000000001'),
    ]);
  });
});

describe('RouteModule.prefetch — у входа и у «Рассылок» prefetch нет', () => {
  it('login, emailLogin, join — публичные экраны, роль ещё не известна', () => {
    expect(prefetchAt('/login')).toEqual([]);
    expect(prefetchAt('/login/email')).toEqual([]);
    expect(prefetchAt('/join/ABC123')).toEqual([]);
  });

  it('broadcasts — окно журнала зависит от search params, единого пути нет', () => {
    expect(prefetchAt('/broadcasts')).toEqual([]);
    expect(prefetchAt('/broadcasts/new')).toEqual([]);
  });
});

describe('RouteModule.prefetch — форма путей', () => {
  it('все пути из prefetch — адрес API без префикса /api, начинаются с /', () => {
    const samplePathnames = [
      '/planning',
      '/schedule',
      '/schedule/new',
      '/schedule/652f00000000000000000001',
      '/planning/new',
      '/planning/652f00000000000000000002',
      '/channels',
      '/channels/652f00000000000000000003',
      '/materials',
      '/materials/new',
      '/materials/tags',
      '/materials/652f00000000000000000008',
      '/events/new',
      '/events/652f00000000000000000009',
      '/templates',
      '/school',
      '/exam-items',
      '/exam-items/652f00000000000000000004',
      '/exams',
      '/exams/new',
      '/exams/652f00000000000000000005',
      '/exams/652f00000000000000000005/preview',
      '/grading',
      '/grading/652f00000000000000000006',
      '/profile',
      '/notifications',
      '/notifications/settings',
      '/board',
      '/tasks',
      '/lessons',
      '/archive',
      '/library',
      '/attempts/652f00000000000000000007',
      '/people',
      '/payments',
    ];

    for (const pathname of samplePathnames) {
      for (const path of prefetchAt(pathname)) {
        expect(path.startsWith('/api')).toBe(false);
        expect(path.startsWith('/')).toBe(true);
      }
    }
  });
});
