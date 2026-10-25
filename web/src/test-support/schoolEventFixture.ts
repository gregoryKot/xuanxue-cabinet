// Готовое `SchoolEventDto` для тестов событий школы (ADR-0177): обязательные
// поля на месте, остальное переопределяется точечно.
import type { SchoolEventDto } from '@xuanxue/shared';

export function makeSchoolEvent(overrides: Partial<SchoolEventDto> = {}): SchoolEventDto {
  return {
    id: 'ev1',
    title: 'Ретрит в Галилее',
    startsAt: '2030-11-14T08:00:00.000Z',
    createdAt: '2026-10-07T10:00:00.000Z',
    ...overrides,
  };
}
