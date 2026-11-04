import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import {
  formatChannelClasses,
  formatClassLabel,
  formatClassOptionLabel,
} from './channelClassesText';

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

describe('formatClassLabel', () => {
  it('название, день недели и время первого правила', () => {
    expect(formatClassLabel(makeClass())).toBe('Тайцзи вт 19:00');
  });

  it('занятие без правил — одно название', () => {
    expect(formatClassLabel(makeClass({ rules: [] }))).toBe('Тайцзи');
  });

  it('выключенное в списке галочек помечено', () => {
    expect(formatClassOptionLabel(makeClass({ active: false }))).toBe(
      'Тайцзи вт 19:00 (выключено)',
    );
  });
});

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
      makeClass({ id: 'b', channelIds: ['ch1'] }),
    ];
    expect(formatChannelClasses('ch1', classes)).toEqual({
      text: '**Все занятия**',
      isWarning: false,
    });
  });

  it('несколько из всех — число со склонением и названия', () => {
    const classes = [
      makeClass({ id: 'a', channelIds: ['ch1'] }),
      makeClass({
        id: 'b',
        title: 'Цигун',
        rules: [{ id: 'r2', weekday: 4, time: '08:30', durationMin: 60 }],
        channelIds: ['ch1'],
      }),
      makeClass({ id: 'c' }),
    ];
    expect(formatChannelClasses('ch1', classes).text).toBe(
      '**2 занятия**: Тайцзи вт 19:00, Цигун чт 08:30',
    );
  });

  it('единственное занятие школы — «1 занятие», а не «Все»', () => {
    expect(formatChannelClasses('ch1', [makeClass({ channelIds: ['ch1'] })]).text).toBe(
      '**1 занятие**: Тайцзи вт 19:00',
    );
  });

  it('больше трёх — три названия и «и ещё N»', () => {
    const classes = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      makeClass({ id, title: id, rules: [], channelIds: id === 'f' ? [] : ['ch1'] }),
    );
    expect(formatChannelClasses('ch1', classes).text).toBe(
      '**5 занятий**: a, b, c и ещё 2',
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
      makeClass({ id: 'b', channelIds: ['ch1'] }),
      makeClass({ id: 'c', active: false }),
    ];
    expect(formatChannelClasses('ch1', classes).text).toBe('**Все занятия**');
  });
});
