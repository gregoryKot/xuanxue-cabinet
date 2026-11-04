import { describe, expect, it } from 'vitest';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import { formatClassDestination } from './classDestinationText';

type Routed = Pick<ClassDto, 'groupIds' | 'active' | 'format'>;
type Channel = Pick<ChannelDto, 'title' | 'groupIds'>;

const GROUPS = [
  { id: 'g1', name: 'Начинающие' },
  { id: 'g2', name: 'Средние' },
  { id: 'g3', name: 'Старшие' },
];
const CHANNELS: Channel[] = [
  { title: 'Тайцзи вечер', groupIds: ['g1'] },
  { title: 'Ученики ВК', groupIds: ['g1'] },
  { title: 'Средние', groupIds: ['g2'] },
  { title: 'Без группы', groupIds: [] },
];
const ONLINE: Routed = { groupIds: ['g1'], active: true, format: 'online' };

describe('formatClassDestination', () => {
  it('одна группа — «→ группа · каналы», чужие каналы и без групп не попадают', () => {
    expect(formatClassDestination(ONLINE, GROUPS, CHANNELS)).toEqual({
      text: '→ Начинающие · Тайцзи вечер, Ученики ВК',
      isWarning: false,
    });
  });

  it('две группы — по строке на каждую, в порядке групп занятия', () => {
    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g1', 'g2'] }, GROUPS, CHANNELS),
    ).toEqual({
      text: '→ Начинающие · Тайцзи вечер, Ученики ВК, Средние · Средние',
      isWarning: false,
    });
  });

  it('канал с обеими группами назван у каждой', () => {
    const both: Channel[] = [{ title: 'Общий чат', groupIds: ['g1', 'g2'] }];

    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g1', 'g2'] }, GROUPS, both)?.text,
    ).toBe('→ Начинающие · Общий чат, Средние · Общий чат');
  });

  it('у части групп нет канала — строка по тем, что дойдут, и красное предупреждение о остальных', () => {
    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g2', 'g3'] }, GROUPS, CHANNELS),
    ).toEqual({
      text: '→ Средние · Средние',
      isWarning: false,
      warning: 'У группы «Старшие» нет канала — туда не уйдёт',
    });
  });

  it('у нескольких групп нет канала — предупреждение во множественном числе', () => {
    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g1', 'g3'] }, GROUPS, [
        { title: 'Тайцзи вечер', groupIds: ['g1'] },
      ]),
    ).toMatchObject({ warning: 'У группы «Старшие» нет канала — туда не уйдёт' });
    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g1', 'g2', 'g3'] }, GROUPS, [
        { title: 'Тайцзи вечер', groupIds: ['g1'] },
      ])?.warning,
    ).toBe('У групп «Средние», «Старшие» нет канала — туда не уйдёт');
  });

  it('ни у одной группы нет канала — красное «Ни у одной группы занятия нет канала»', () => {
    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g1', 'g2'] }, GROUPS, [
        { title: 'Без группы', groupIds: [] },
      ]),
    ).toEqual({
      text: 'Ни у одной группы занятия нет канала — никуда не уходит',
      isWarning: true,
    });
  });

  it('у единственной группы нет канала — предупреждение называет её', () => {
    expect(
      formatClassDestination({ ...ONLINE, groupIds: ['g3'] }, GROUPS, CHANNELS),
    ).toEqual({
      text: 'У группы «Старшие» нет канала — никуда не уходит',
      isWarning: true,
    });
  });

  it('занятие без групп — «Без группы — никуда не уходит», даже когда каналы есть', () => {
    expect(formatClassDestination({ ...ONLINE, groupIds: [] }, GROUPS, CHANNELS)).toEqual(
      {
        text: 'Без группы — никуда не уходит',
        isWarning: true,
      },
    );
  });

  it('«офлайн + онлайн» без канала — тоже предупреждение', () => {
    expect(
      formatClassDestination(
        { ...ONLINE, format: 'both', groupIds: [] },
        GROUPS,
        CHANNELS,
      )?.isWarning,
    ).toBe(true);
  });

  it('офлайн без каналов — строки нет: рассылать нечего', () => {
    expect(
      formatClassDestination(
        { ...ONLINE, format: 'offline', groupIds: [] },
        GROUPS,
        CHANNELS,
      ),
    ).toBeNull();
  });

  it('выключенное занятие: без групп или каналов — без предупреждения; с каналами — стрелка остаётся; частичное предупреждение не показываем', () => {
    expect(
      formatClassDestination(
        { ...ONLINE, active: false, groupIds: [] },
        GROUPS,
        CHANNELS,
      ),
    ).toBeNull();
    expect(
      formatClassDestination({ ...ONLINE, active: false }, GROUPS, CHANNELS)?.isWarning,
    ).toBe(false);
    expect(
      formatClassDestination(
        { ...ONLINE, active: false, groupIds: ['g2', 'g3'] },
        GROUPS,
        CHANNELS,
      ),
    ).toEqual({ text: '→ Средние · Средние', isWarning: false });
  });

  it('каналы или группы ещё грузятся (null) — строки нет, не ложное предупреждение', () => {
    expect(formatClassDestination(ONLINE, GROUPS, null)).toBeNull();
    expect(formatClassDestination(ONLINE, null, CHANNELS)).toBeNull();
  });

  it('пустой список каналов — предупреждение (каналов в школе нет)', () => {
    expect(formatClassDestination(ONLINE, GROUPS, [])?.isWarning).toBe(true);
  });
});
