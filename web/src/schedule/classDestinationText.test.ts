import { describe, expect, it } from 'vitest';
import type { ChannelDto, ClassDto } from '@xuanxue/shared';
import { formatClassDestination } from './classDestinationText';

type Routed = Pick<
  ClassDto,
  'groupId' | 'forAllGroups' | 'groupLabel' | 'active' | 'format'
>;
type Channel = Pick<ChannelDto, 'title' | 'groupId'>;

const CHANNELS: Channel[] = [
  { title: 'Тайцзи вечер', groupId: 'g1' },
  { title: 'Ученики ВК', groupId: 'g1' },
  { title: 'Средние', groupId: 'g2' },
  { title: 'Без группы', groupId: null },
];
const ONLINE: Routed = {
  groupId: 'g1',
  forAllGroups: false,
  groupLabel: 'Начинающие',
  active: true,
  format: 'online',
};

describe('formatClassDestination', () => {
  it('занятие группы — каналы этой группы через запятую, чужие и без группы не попадают', () => {
    expect(formatClassDestination(ONLINE, CHANNELS)).toEqual({
      text: '→ Тайцзи вечер, Ученики ВК',
      isWarning: false,
    });
  });

  it('занятие для всех групп — все каналы, у которых есть группа', () => {
    expect(
      formatClassDestination(
        { ...ONLINE, groupId: null, forAllGroups: true, groupLabel: 'все группы' },
        CHANNELS,
      ),
    ).toEqual({
      text: '→ все каналы с группой: Тайцзи вечер, Ученики ВК, Средние',
      isWarning: false,
    });
  });

  it('занятие для всех групп, а группа есть не у одного канала — красное предупреждение', () => {
    expect(
      formatClassDestination({ ...ONLINE, groupId: null, forAllGroups: true }, [
        { title: 'Без группы', groupId: null },
      ]),
    ).toEqual({
      text: 'Ни у одного канала нет группы — никуда не уходит',
      isWarning: true,
    });
  });

  it('занятие без группы — «Без группы — никуда не уходит», даже когда каналы есть', () => {
    expect(formatClassDestination({ ...ONLINE, groupId: null }, CHANNELS)).toEqual({
      text: 'Без группы — никуда не уходит',
      isWarning: true,
    });
  });

  it('у группы нет канала — предупреждение называет группу', () => {
    expect(
      formatClassDestination(
        { ...ONLINE, groupId: 'g3', groupLabel: 'Старшие' },
        CHANNELS,
      ),
    ).toEqual({
      text: 'У группы «Старшие» нет канала — никуда не уходит',
      isWarning: true,
    });
  });

  it('«офлайн + онлайн» без канала — тоже предупреждение', () => {
    expect(
      formatClassDestination({ ...ONLINE, format: 'both', groupId: null }, CHANNELS)
        ?.isWarning,
    ).toBe(true);
  });

  it('офлайн без каналов — строки нет: рассылать нечего', () => {
    expect(
      formatClassDestination({ ...ONLINE, format: 'offline', groupId: null }, CHANNELS),
    ).toBeNull();
  });

  it('выключенное занятие без каналов — без предупреждения; с каналами — стрелка остаётся', () => {
    expect(
      formatClassDestination({ ...ONLINE, active: false, groupId: null }, CHANNELS),
    ).toBeNull();
    expect(
      formatClassDestination({ ...ONLINE, active: false }, CHANNELS)?.isWarning,
    ).toBe(false);
  });

  it('каналы ещё грузятся (null) — строки нет, не ложное предупреждение', () => {
    expect(formatClassDestination(ONLINE, null)).toBeNull();
  });

  it('пустой список каналов — предупреждение (каналов в школе нет)', () => {
    expect(formatClassDestination(ONLINE, [])?.isWarning).toBe(true);
  });
});
