import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { buildScheduleGrid, ruleEndTime } from './scheduleGrid';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
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
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('ruleEndTime', () => {
  it('08:00 + 90 минут — «09:30»', () => {
    expect(ruleEndTime({ id: 'r1', weekday: 2, time: '08:00', durationMin: 90 })).toBe(
      '09:30',
    );
  });

  it('переход через полночь: 23:30 + 60 минут — «00:30»', () => {
    expect(ruleEndTime({ id: 'r1', weekday: 5, time: '23:30', durationMin: 60 })).toBe(
      '00:30',
    );
  });

  it('ровно в полночь: 23:00 + 60 минут — «00:00», не «24:00»', () => {
    expect(ruleEndTime({ id: 'r1', weekday: 5, time: '23:00', durationMin: 60 })).toBe(
      '00:00',
    );
  });

  it('длительность больше суток — конец всё равно в пределах суток', () => {
    expect(ruleEndTime({ id: 'r1', weekday: 5, time: '10:15', durationMin: 1500 })).toBe(
      '11:15',
    );
  });
});

describe('buildScheduleGrid', () => {
  it('пустой список занятий — все 7 дней пустые', () => {
    const grid = buildScheduleGrid([]);
    expect(Object.keys(grid)).toHaveLength(7);
    expect(grid[0]).toEqual([]);
    expect(grid[6]).toEqual([]);
  });

  it('несколько правил одного занятия попадают в разные дни', () => {
    const cls = makeClass({
      rules: [
        { id: 'r1', weekday: 2, time: '19:00', durationMin: 60 },
        { id: 'r2', weekday: 4, time: '19:00', durationMin: 60 },
      ],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[2]).toHaveLength(1);
    expect(grid[4]).toHaveLength(1);
  });

  it('слоты одного дня сортируются по времени начала', () => {
    const early = makeClass({
      id: 'a',
      title: 'Раннее',
      rules: [{ id: 'r1', weekday: 1, time: '08:00', durationMin: 30 }],
    });
    const late = makeClass({
      id: 'b',
      title: 'Позднее',
      rules: [{ id: 'r2', weekday: 1, time: '19:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([late, early]);

    expect(grid[1].map((slot) => slot.title)).toEqual(['Раннее', 'Позднее']);
  });

  it('занятие без rules не попадает ни в один день', () => {
    const grid = buildScheduleGrid([makeClass({ rules: [] })]);

    expect(Object.values(grid).flat()).toHaveLength(0);
  });

  it('правило с нечисловым временем пропускается, а не ломает сортировку', () => {
    const broken = makeClass({
      id: 'b',
      title: 'Битое',
      rules: [{ id: 'r1', weekday: 3, time: 'ab:cd', durationMin: 30 }],
    });
    const ok = makeClass({
      id: 'o',
      title: 'Нормальное',
      rules: [{ id: 'r2', weekday: 3, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([broken, ok]);

    expect(grid[3].map((slot) => slot.title)).toEqual(['Нормальное']);
  });

  it('онлайн без ссылки Zoom — linkMissing у слота', () => {
    const cls = makeClass({
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.linkMissing).toBe(true);
  });

  it('онлайн со ссылкой — linkMissing false', () => {
    const cls = makeClass({
      zoomLink: 'https://us02web.zoom.us/j/1',
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.linkMissing).toBe(false);
  });

  it('офлайн без ссылки — не «без ссылки»: ссылки там и не должно быть', () => {
    const cls = makeClass({
      format: 'offline',
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.linkMissing).toBe(false);
  });

  it('слот несёт число активных каналов рассылки занятия (ревью п.1)', () => {
    const cls = makeClass({
      channelIds: ['ch1', 'ch2'],
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls], new Set(['ch1', 'ch2']));

    expect(grid[1][0]?.channelCount).toBe(2);
  });

  it('без списка активных каналов — channelCount 0, а не channelIds.length (ревью п.4)', () => {
    const cls = makeClass({
      channelIds: ['ch1'],
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.channelCount).toBe(0);
  });

  it('выключенный канал в channelIds не считается активным (ревью п.4)', () => {
    const cls = makeClass({
      channelIds: ['ch1', 'ch2'],
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls], new Set(['ch1']));

    expect(grid[1][0]?.channelCount).toBe(1);
  });

  it('теги курса переносятся в слот как есть (ADR-0072)', () => {
    const cls = makeClass({
      tags: ['начинающие', 'медитация'],
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.tags).toEqual(['начинающие', 'медитация']);
  });

  it('занятие без тегов — у слота пустой массив, не undefined', () => {
    const cls = makeClass({
      tags: [],
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.tags).toEqual([]);
  });

  it('слот несёт начало и конец отдельными полями', () => {
    const cls = makeClass({
      rules: [{ id: 'r1', weekday: 2, time: '08:00', durationMin: 90 }],
    });

    const slot = buildScheduleGrid([cls])[2][0];

    expect(slot?.startTime).toBe('08:00');
    expect(slot?.endTime).toBe('09:30');
  });

  it('конец занятия за полночь — «00:30» у слота', () => {
    const cls = makeClass({
      rules: [{ id: 'r1', weekday: 5, time: '23:30', durationMin: 60 }],
    });

    const slot = buildScheduleGrid([cls])[5][0];

    expect(slot?.startTime).toBe('23:30');
    expect(slot?.endTime).toBe('00:30');
  });

  it('адрес занятия переносится в слот как есть', () => {
    const cls = makeClass({
      format: 'offline',
      location: 'Парк Яркон, у входа',
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.location).toBe('Парк Яркон, у входа');
  });

  it('занятие без адреса — у слота location не задан', () => {
    const cls = makeClass({
      rules: [{ id: 'r1', weekday: 1, time: '10:00', durationMin: 30 }],
    });

    const grid = buildScheduleGrid([cls]);

    expect(grid[1][0]?.location).toBeUndefined();
  });
});
