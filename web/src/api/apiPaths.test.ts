// Тест только на функции с логикой (CLAUDE.md «Чистая логика») — константы
// вроде CLASSES_LIST_PATH или TEACHERS_PATH это строковые литералы, их
// используют хуки и routePrefetch.test.ts, проверять отдельно нечего.
import { describe, expect, it } from 'vitest';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import { planningWindow } from '../planning/planningWindow';
import {
  attemptPath,
  channelsListPath,
  entityPath,
  examAttemptCountPath,
  examImageSrc,
  examItemsListPath,
  examsListPath,
  lessonsListPath,
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
});

describe('channelsListPath', () => {
  it('без activeOnly — все каналы', () => {
    expect(channelsListPath(false)).toBe(`/channels?limit=${LIST_LIMIT_MAX}`);
  });

  it('activeOnly — только активные', () => {
    expect(channelsListPath(true)).toBe(`/channels?active=true&limit=${LIST_LIMIT_MAX}`);
  });
});

describe('entityPath', () => {
  it('собирает путь записи из пути коллекции и id', () => {
    expect(entityPath('/classes', '652f00000000000000000001')).toBe(
      '/classes/652f00000000000000000001',
    );
  });
});

describe('attemptPath', () => {
  it('собирает путь своей попытки по id (ADR-0126)', () => {
    expect(attemptPath('652f00000000000000000001')).toBe(
      '/attempts/652f00000000000000000001',
    );
  });
});

describe('examAttemptCountPath', () => {
  it('собирает путь счётчика попыток по id экзамена', () => {
    expect(examAttemptCountPath('652f00000000000000000001')).toBe(
      '/exams/652f00000000000000000001/attempt-count',
    );
  });
});

describe('examImageSrc', () => {
  it('собирает адрес картинки с префиксом /api для <img src>', () => {
    expect(examImageSrc('652f00000000000000000001')).toBe(
      '/api/exam-images/652f00000000000000000001',
    );
  });
});
