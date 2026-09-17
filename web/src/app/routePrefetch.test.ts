// Тест таблицы предзагрузки данных первого экрана (routeModules.ts,
// firstScreenPrefetch.ts) — отдельно от matchRoute (routeModules.test.ts):
// здесь важно не какой чанк выбран, а какие пути строятся для него.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ATTEMPTS_LIST_PATH,
  CLASSES_LIST_PATH,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  GRADING_QUEUE_PATH,
  INVITE_LINK_PATH,
  NOTIFICATION_PREFS_PATH,
  SETTINGS_PATH,
  TEACHERS_PATH,
  channelsListPath,
  examItemsListPath,
  examsListPath,
  lessonsListPath,
  nextLessonsPath,
} from '../api/apiPaths';
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
  it('/planning (и /) — занятия на окно и классы', () => {
    expect(prefetchAt('/planning')).toEqual([lessonsListPath(), CLASSES_LIST_PATH]);
    expect(prefetchAt('/')).toEqual([lessonsListPath(), CLASSES_LIST_PATH]);
  });

  it('/schedule — классы и активные каналы (оба грузит ScheduleScreen.tsx)', () => {
    expect(prefetchAt('/schedule')).toEqual([CLASSES_LIST_PATH, channelsListPath(true)]);
  });

  it('/channels — список всех каналов', () => {
    expect(prefetchAt('/channels')).toEqual([channelsListPath(false)]);
  });

  it('/templates — настройки и ближайшие занятия для предпросмотра', () => {
    expect(prefetchAt('/templates')).toEqual([SETTINGS_PATH, nextLessonsPath()]);
  });

  it('/exam-items — банк без фильтра', () => {
    expect(prefetchAt('/exam-items')).toEqual([examItemsListPath('')]);
  });

  it('/exams — список без фильтра, очередь проверки, статистика вопросов', () => {
    expect(prefetchAt('/exams')).toEqual([
      examsListPath({ status: '' }),
      GRADING_QUEUE_PATH,
      EXAM_ITEM_STATS_SUMMARY_PATH,
    ]);
  });

  it('/grading — очередь проверки', () => {
    expect(prefetchAt('/grading')).toEqual([GRADING_QUEUE_PATH]);
  });

  it('/notifications — настройки уведомлений', () => {
    expect(prefetchAt('/notifications')).toEqual([NOTIFICATION_PREFS_PATH]);
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

  it('/exams/new — банк вопросов без фильтра', () => {
    expect(prefetchAt('/exams/new')).toEqual([examItemsListPath('')]);
  });

  it('/channels/new и /exam-items/new — форма не ждёт ничего кроме себя, prefetch не задан', () => {
    expect(prefetchAt('/channels/new')).toEqual([]);
    expect(prefetchAt('/exam-items/new')).toEqual([]);
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

  it('/exams/:id — карточка экзамена и банк вопросов без фильтра', () => {
    expect(prefetchAt('/exams/652f00000000000000000006')).toEqual([
      '/exams/652f00000000000000000006',
      examItemsListPath(''),
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

  it('/attempts/:id — список попыток целиком (экран ищет свою в нём)', () => {
    expect(prefetchAt('/attempts/652f00000000000000000001')).toEqual([
      ATTEMPTS_LIST_PATH,
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
      '/templates',
      '/exam-items',
      '/exam-items/652f00000000000000000004',
      '/exams',
      '/exams/new',
      '/exams/652f00000000000000000005',
      '/grading',
      '/grading/652f00000000000000000006',
      '/notifications',
      '/attempts/652f00000000000000000007',
      '/people',
    ];

    for (const pathname of samplePathnames) {
      for (const path of prefetchAt(pathname)) {
        expect(path.startsWith('/api')).toBe(false);
        expect(path.startsWith('/')).toBe(true);
      }
    }
  });
});
