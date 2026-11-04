import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { groupClassesByCourse } from './groupClassesByCourse';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: 'Начинающие',
    groupIds: [],
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
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

function slot(id: string, weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6, time: string) {
  return { id, weekday, time, durationMin: 60 };
}

describe('groupClassesByCourse', () => {
  it('занятия с одним названием и группой — одна строка, дни в порядке недели школы (с воскресенья, как в «Расписании»)', () => {
    const rows = groupClassesByCourse(
      [
        makeClass({ id: 'a', rules: [slot('r1', 0, '20:00')] }),
        makeClass({ id: 'b', rules: [slot('r2', 3, '19:00')] }),
        makeClass({ id: 'c', rules: [slot('r3', 1, '19:00')] }),
      ],
      'ch1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('Тайцзицюань · Начинающие');
    expect(rows[0]?.classes.map((cls) => cls.id)).toEqual(['a', 'b', 'c']);
    expect(rows[0]?.days).toBe('вс 20:00, пн 19:00, ср 19:00');
  });

  it('другая группа — другая строка; порядок по названию, потом по группе', () => {
    const rows = groupClassesByCourse(
      [
        makeClass({ id: 'a', title: 'Цигун', groupLabel: '' }),
        makeClass({ id: 'b', groupLabel: 'Средние' }),
        makeClass({ id: 'c', groupLabel: 'Начинающие' }),
      ],
      'ch1',
    );
    expect(rows.map((row) => row.name)).toEqual([
      'Тайцзицюань · Начинающие',
      'Тайцзицюань · Средние',
      'Цигун',
    ]);
  });

  it('выключенные занятия не попадают в строки и не влияют на состояние', () => {
    const rows = groupClassesByCourse(
      [
        makeClass({ id: 'a', channelIds: ['ch1'] }),
        makeClass({ id: 'b', active: false, rules: [slot('r2', 5, '10:00')] }),
        makeClass({ id: 'c', title: 'Старое', active: false }),
      ],
      'ch1',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.state).toBe('all');
    expect(rows[0]?.days).toBe('вт 19:00');
  });

  it('состояние: все привязаны, часть, ни одного', () => {
    const mk = (linked: boolean[]) =>
      groupClassesByCourse(
        linked.map((on, i) =>
          makeClass({ id: `c${i}`, channelIds: on ? ['ch1'] : ['x'] }),
        ),
        'ch1',
      )[0]?.state;
    expect(mk([true, true])).toBe('all');
    expect(mk([true, false])).toBe('some');
    expect(mk([false, false])).toBe('none');
  });

  it('одинаковое время у двух занятий курса не дублируется; без правил — пустые дни', () => {
    const rows = groupClassesByCourse(
      [
        makeClass({ id: 'a' }),
        makeClass({ id: 'b' }),
        makeClass({ id: 'c', title: 'Нейгун', groupLabel: '', rules: [] }),
      ],
      'ch1',
    );
    expect(rows.find((row) => row.name === 'Тайцзицюань · Начинающие')?.days).toBe(
      'вт 19:00',
    );
    expect(rows.find((row) => row.name === 'Нейгун')?.days).toBe('');
  });
});
