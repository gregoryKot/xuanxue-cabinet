import { describe, expect, it } from 'vitest';
import type { ChannelDto, ClassDto, GroupDto } from '@xuanxue/shared';
import { countUndeliveredClasses, undeliveredNotice } from './undeliveredClasses';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань, средняя группа',
    groupLabel: '',
    groupIds: ['g1'],
    format: 'online',
    rules: [{ id: 'r1', weekday: 2, time: '19:00', durationMin: 60 }],
    tz: 'Asia/Jerusalem',
    leadMinutes: 30,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeChannel(groupIds: string[]): ChannelDto {
  return {
    id: 'ch1',
    type: 'telegram',
    title: 'Канал школы',
    target: '@xuanxue',
    groupIds,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeGroup(id: string, name: string): GroupDto {
  return {
    id,
    name,
    classCount: 0,
    channelCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const GROUPS = [makeGroup('g1', 'Средние'), makeGroup('g2', 'Старшие')];

describe('countUndeliveredClasses', () => {
  it('что-то ещё грузится — null', () => {
    const channels = [makeChannel(['g1'])];
    expect(countUndeliveredClasses(null, GROUPS, channels)).toBeNull();
    expect(countUndeliveredClasses([makeClass()], null, channels)).toBeNull();
    expect(countUndeliveredClasses([makeClass()], GROUPS, null)).toBeNull();
  });

  it('всё доходит — 0', () => {
    expect(countUndeliveredClasses([makeClass()], GROUPS, [makeChannel(['g1'])])).toBe(0);
  });

  it('онлайн без группы — считается', () => {
    expect(countUndeliveredClasses([makeClass({ groupIds: [] })], GROUPS, [])).toBe(1);
  });

  it('выключенное и офлайн без группы не считаются', () => {
    const classes = [
      makeClass({ id: 'a', groupIds: [], active: false }),
      makeClass({ id: 'b', groupIds: [], format: 'offline' }),
    ];
    expect(countUndeliveredClasses(classes, GROUPS, [])).toBe(0);
  });

  it('у одной из двух групп нет канала — считается', () => {
    const cls = makeClass({ groupIds: ['g1', 'g2'] });
    expect(countUndeliveredClasses([cls], GROUPS, [makeChannel(['g1'])])).toBe(1);
  });
});

describe('undeliveredNotice', () => {
  it('null и 0 — без строки', () => {
    expect(undeliveredNotice(null)).toBeNull();
    expect(undeliveredNotice(0)).toBeNull();
  });

  it.each([
    [1, 'занятия'],
    [2, 'занятий'],
    [5, 'занятий'],
    [21, 'занятия'],
  ])('%i — «%s»', (count, noun) => {
    expect(undeliveredNotice(count)).toBe(
      `У **${count} ${noun}** из правил недели ссылка дойдёт не до всех групп.`,
    );
  });
});
