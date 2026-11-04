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
    groupIds: [],
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
  it('у канала нет групп — красное «Группы не выбраны», посты не уходят', () => {
    expect(
      formatChannelGroup({ groupIds: [] }, GROUPS, [cls({ groupIds: ['g1'] })]),
    ).toEqual({
      text: 'Группы не выбраны — посты сюда не уходят',
      isWarning: true,
    });
  });

  it('группа есть — название выделено, занятия считаются по пересечению групп', () => {
    const classes = [
      cls({ id: 'a', groupIds: ['g1'] }),
      cls({ id: 'b', groupIds: ['g1', 'g2'] }),
      cls({ id: 'c', groupIds: ['g2'] }),
      cls({ id: 'd', groupIds: [] }),
    ];

    expect(formatChannelGroup({ groupIds: ['g1'] }, GROUPS, classes)).toEqual({
      text: 'Группы: **Начинающие** · 2 занятия',
      isWarning: false,
    });
  });

  it('две группы — названия через запятую, занятие с обеими считается один раз', () => {
    const classes = [
      cls({ id: 'a', groupIds: ['g1', 'g2'] }),
      cls({ id: 'b', groupIds: ['g2'] }),
    ];

    expect(formatChannelGroup({ groupIds: ['g1', 'g2'] }, GROUPS, classes)).toEqual({
      text: 'Группы: **Начинающие, Средние** · 2 занятия',
      isWarning: false,
    });
  });

  it('выключенное занятие в счёт не входит; занятий нет — честное «Занятий нет»', () => {
    const classes = [cls({ groupIds: ['g1'], active: false })];

    expect(formatChannelGroup({ groupIds: ['g1'] }, GROUPS, classes)?.text).toBe(
      'Группы: **Начинающие** · Занятий нет',
    );
    expect(formatChannelGroup({ groupIds: ['g1'] }, GROUPS, [])?.text).toBe(
      'Группы: **Начинающие** · Занятий нет',
    );
  });

  it('групп канала нет в списке групп — строки нет, а не чужое название', () => {
    expect(formatChannelGroup({ groupIds: ['gone'] }, GROUPS, [])).toBeNull();
  });
});
