// Тест только на функции с логикой (CLAUDE.md «Чистая логика») — константы
// вроде CLASSES_LIST_PATH или TEACHERS_PATH это строковые литералы, их
// используют хуки и routePrefetch.test.ts, проверять отдельно нечего.
import { describe, expect, it } from 'vitest';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { planningWindow } from '../planning/planningWindow';
import { apiRoutePath } from './apiRoute';
import {
  channelsListPath,
  CLASSES_LIST_PATH,
  examImageSrc,
  EXAM_EDITOR_ITEMS_PATH,
  examItemsListPath,
  EXAM_ITEM_STATS_SUMMARY_PATH,
  examsListPath,
  lessonsListPath,
  materialsListPath,
} from './apiPaths';

describe('lessonsListPath', () => {
  it('строит путь из окна planningWindow(now) — тот же расчёт, что у хука', () => {
    const now = new Date('2026-09-16T12:00:00.000Z');
    const { from, to } = planningWindow(now);

    expect(lessonsListPath(now)).toBe(
      `/lessons?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${LIST_LIMIT_MAX}`,
    );
  });
});

describe('examsListPath', () => {
  it('пустой статус — «Все», только лимит', () => {
    expect(examsListPath({ status: '' })).toBe(`/exams?limit=${LIST_LIMIT_MAX}`);
  });

  it('статус задан — добавлен параметром', () => {
    expect(examsListPath({ status: 'published' })).toBe(
      `/exams?limit=${LIST_LIMIT_MAX}&status=published`,
    );
  });
});

describe('examItemsListPath', () => {
  it('пустой статус — «Все», только лимит', () => {
    expect(examItemsListPath('')).toBe(`/exam-items?limit=${LIST_LIMIT_MAX}`);
  });

  it('статус задан — добавлен параметром', () => {
    expect(examItemsListPath('published')).toBe(
      `/exam-items?limit=${LIST_LIMIT_MAX}&status=published`,
    );
  });

  // Удалённые из банка вопросы (ADR-0140) — только для редактора и
  // предпросмотра экзамена, по умолчанию их в списке нет.
  it('список вопросов — без удалённых', () => {
    expect(examItemsListPath('')).not.toContain('includeDeleted');
  });

  it('EXAM_EDITOR_ITEMS_PATH — все статусы и удалённые', () => {
    expect(EXAM_EDITOR_ITEMS_PATH).toBe(
      `/exam-items?limit=${LIST_LIMIT_MAX}&includeDeleted=true`,
    );
  });
});

describe('channelsListPath', () => {
  it('без activeOnly — все каналы', () => {
    expect(channelsListPath(false)).toBe(`/channels?limit=${LIST_LIMIT_MAX}`);
  });

  it('activeOnly — только активные', () => {
    expect(channelsListPath(true)).toBe(`/channels?active=true&limit=${LIST_LIMIT_MAX}`);
  });
});

describe('materialsListPath', () => {
  it('без фильтров — только лимит', () => {
    expect(materialsListPath('')).toBe(`/materials?limit=${LIST_LIMIT_MAX}`);
  });

  it('вид и тег — после лимита, тег кодируется, чтобы слэш не резал путь', () => {
    expect(materialsListPath('book', 'ушу/тайцзи')).toBe(
      `/materials?limit=${LIST_LIMIT_MAX}&kind=book&tag=${encodeURIComponent('ушу/тайцзи')}`,
    );
  });
});

// Строка пути — ключ кэша предзагрузки: apiRoute собирает её по карте, и она
// обязана совпасть с прежним литералом символ в символ.
describe('пути предзагрузки по карте маршрутов', () => {
  it('список занятий и сводка вопросов', () => {
    expect(CLASSES_LIST_PATH).toBe(`/classes?limit=${LIST_LIMIT_MAX}`);
    expect(EXAM_ITEM_STATS_SUMMARY_PATH).toBe('/exam-items/stats-summary');
  });

  it('счётчик попыток экзамена — по id из пути', () => {
    expect(
      apiRoutePath('GET /exams/:examId/attempt-count', {
        params: { examId: '652f00000000000000000001' },
      }),
    ).toBe('/exams/652f00000000000000000001/attempt-count');
  });
});

describe('examImageSrc', () => {
  it('собирает адрес картинки с префиксом /api для <img src>', () => {
    expect(examImageSrc('652f00000000000000000001')).toBe(
      '/api/exam-images/652f00000000000000000001',
    );
  });
});
