import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { formatChannelClasses } from './channelClassesText';

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзи',
    groupLabel: '',
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

describe('formatChannelClasses', () => {
  it('занятий в школе нет — честный текст, не предупреждение', () => {
    expect(formatChannelClasses('ch1', [])).toEqual({
      text: 'Занятий в расписании пока нет.',
      isWarning: false,
    });
  });

  it('ни одно не привязано — предупреждение', () => {
    const line = formatChannelClasses('ch1', [makeClass({ channelIds: ['other'] })]);
    expect(line).toEqual({
      text: 'Ни одного занятия — посты сюда не уходят',
      isWarning: true,
    });
  });

  it('привязаны все включённые — «Все занятия»', () => {
    const classes = [
      makeClass({ id: 'a', channelIds: ['ch1'] }),
      makeClass({ id: 'b', title: 'Цигун', channelIds: ['ch1'] }),
    ];
    expect(formatChannelClasses('ch1', classes)).toEqual({
      text: '**Все занятия**',
      isWarning: false,
    });
  });

  it('несколько курсов из всех — число со склонением и названия курсов', () => {
    const classes = [
      makeClass({ id: 'a', channelIds: ['ch1'] }),
      makeClass({ id: 'a2', channelIds: ['ch1'] }),
      makeClass({ id: 'b', title: 'Цигун', channelIds: ['ch1'] }),
      makeClass({ id: 'c', title: 'Нейгун' }),
    ];
    expect(formatChannelClasses('ch1', classes).text).toBe('**2 курса**: Тайцзи, Цигун');
  });

  it('слоты одного курса считаются одним курсом, в названии есть группа', () => {
    const classes = ['a', 'b', 'c'].map((id) =>
      makeClass({ id, groupLabel: 'Начинающие', channelIds: ['ch1'] }),
    );
    classes.push(makeClass({ id: 'd', title: 'Цигун' }));
    expect(formatChannelClasses('ch1', classes).text).toBe(
      '**1 курс**: Тайцзи · Начинающие',
    );
  });

  it('курс, привязанный частью слотов, всё равно назван', () => {
    const classes = [
      makeClass({ id: 'a', channelIds: ['ch1'] }),
      makeClass({ id: 'b' }),
      makeClass({ id: 'c', title: 'Цигун' }),
    ];
    expect(formatChannelClasses('ch1', classes).text).toBe('**1 курс**: Тайцзи');
  });

  it('единственный курс школы — «1 курс», а не «Все»', () => {
    expect(formatChannelClasses('ch1', [makeClass({ channelIds: ['ch1'] })]).text).toBe(
      '**1 курс**: Тайцзи',
    );
  });

  it('больше трёх — три названия и «и ещё N»', () => {
    const classes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      makeClass({ id, title: id, rules: [], channelIds: id === 'f' ? [] : ['ch1'] }),
    );
    expect(formatChannelClasses('ch1', classes).text).toBe(
      '**5 курсов**: a, b, c и ещё 2',
    );
  });

  it('выключенное занятие не считается: привязано только оно — «ни одного»', () => {
    const classes = [
      makeClass({ id: 'a', active: false, channelIds: ['ch1'] }),
      makeClass({ id: 'b' }),
    ];
    expect(formatChannelClasses('ch1', classes).isWarning).toBe(true);
  });

  it('выключенное не мешает «Всем»: привязаны все включённые', () => {
    const classes = [
      makeClass({ id: 'a', channelIds: ['ch1'] }),
      makeClass({ id: 'b', title: 'Цигун', channelIds: ['ch1'] }),
      makeClass({ id: 'c', title: 'Цигун', active: false }),
    ];
    expect(formatChannelClasses('ch1', classes).text).toBe('**Все занятия**');
  });
});
