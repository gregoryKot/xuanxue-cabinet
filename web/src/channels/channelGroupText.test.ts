import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { formatChannelGroup } from './channelGroupText';

const GROUPS = [
  { id: 'g1', name: 'Начинающие' },
  { id: 'g2', name: 'Средние' },
];

function cls(overrides: Partial<ClassDto>): ClassDto {
  return {
    id: 'c',
    title: 'Занятие',
    groupLabel: '',
    groupId: null,
    forAllGroups: false,
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    leadMinutes: 30,
    active: true,
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('formatChannelGroup', () => {
  it('у канала нет группы — красное «Группа не выбрана», посты не уходят', () => {
    expect(
      formatChannelGroup({ groupId: null }, GROUPS, [cls({ groupId: 'g1' })]),
    ).toEqual({
      text: 'Группа не выбрана — посты сюда не уходят',
      isWarning: true,
    });
  });

  it('группа есть — название выделено, занятия считаются: свои и «для всех»', () => {
    const classes = [
      cls({ id: 'a', groupId: 'g1' }),
      cls({ id: 'b', groupId: 'g1' }),
      cls({ id: 'c', groupId: 'g2' }),
      cls({ id: 'd', forAllGroups: true }),
    ];

    expect(formatChannelGroup({ groupId: 'g1' }, GROUPS, classes)).toEqual({
      text: 'Группа: **Начинающие** · 3 занятия',
      isWarning: false,
    });
  });

  it('выключенное занятие в счёт не входит; занятий нет — честное «Занятий нет»', () => {
    const classes = [cls({ groupId: 'g1', active: false })];

    expect(formatChannelGroup({ groupId: 'g1' }, GROUPS, classes)?.text).toBe(
      'Группа: **Начинающие** · Занятий нет',
    );
    expect(formatChannelGroup({ groupId: 'g1' }, GROUPS, [])?.text).toBe(
      'Группа: **Начинающие** · Занятий нет',
    );
  });

  it('группы канала нет в списке групп — строки нет, а не чужое название', () => {
    expect(formatChannelGroup({ groupId: 'gone' }, GROUPS, [])).toBeNull();
  });
});
