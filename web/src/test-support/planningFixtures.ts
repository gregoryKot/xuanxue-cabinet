// Фикстуры «Планирования», общие для PlanningScreen.test.tsx (apiFetch
// целиком замокан) и PlanningScreen.prefetch.test.tsx (apiFetch настоящий,
// мокнут только fetch) — один и тот же класс/занятие для обоих файлов, а не
// два похожих литерала (иначе jscpd ловит дубль, CLAUDE.md «Дубли»).
import type { ClassDto, LessonDto } from '@xuanxue/shared';

export function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeLesson(overrides: Partial<LessonDto> = {}): LessonDto {
  return {
    id: 'l1',
    classId: 'c1',
    startsAt: '2026-09-08T16:00:00.000Z',
    durationMin: 60,
    topic: '',
    status: 'scheduled',
    recordings: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
