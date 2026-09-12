import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { inheritedZoomHint } from './inheritedZoom';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
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

describe('inheritedZoomHint', () => {
  it('у занятия расписания есть ссылка — она видна прямо в подсказке', () => {
    const hint = inheritedZoomHint(
      makeClass({ zoomLink: 'https://us02web.zoom.us/j/1' }),
    );

    expect(hint).toContain('https://us02web.zoom.us/j/1');
  });

  it('ссылки в расписании нет — сказано, что рассылка уйдёт без неё', () => {
    expect(inheritedZoomHint(makeClass())).toContain('рассылка уйдёт без неё');
  });

  it('офлайн без ссылки — не тревога: ссылка там и не нужна', () => {
    const hint = inheritedZoomHint(makeClass({ format: 'offline' }));

    expect(hint).toBe('Занятие офлайн — ссылка Zoom ему не нужна');
  });

  it('класс ещё не загрузился — общая подпись без обещаний', () => {
    expect(inheritedZoomHint(undefined)).toBe('Оставьте пустым — берётся из расписания');
  });
});
