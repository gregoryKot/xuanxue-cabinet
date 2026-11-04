import { describe, expect, it } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import { formatClassDestination } from './classDestinationText';

const CHANNELS = [
  { id: 'ch1', title: 'Тайцзи вечер' },
  { id: 'ch2', title: 'Ученики' },
];
const ONLINE: Pick<ClassDto, 'channelIds' | 'active' | 'format'> = {
  channelIds: [],
  active: true,
  format: 'online',
};

describe('formatClassDestination', () => {
  it('один канал — «→ название»', () => {
    expect(formatClassDestination({ ...ONLINE, channelIds: ['ch1'] }, CHANNELS)).toEqual({
      text: '→ Тайцзи вечер',
      isWarning: false,
    });
  });

  it('несколько — названия через запятую в порядке занятия', () => {
    expect(
      formatClassDestination({ ...ONLINE, channelIds: ['ch2', 'ch1'] }, CHANNELS)?.text,
    ).toBe('→ Ученики, Тайцзи вечер');
  });

  it('выключенный или удалённый канал в строку не попадает', () => {
    expect(
      formatClassDestination({ ...ONLINE, channelIds: ['ch1', 'gone'] }, CHANNELS)?.text,
    ).toBe('→ Тайцзи вечер');
  });

  it('онлайн без активных каналов — предупреждение', () => {
    expect(formatClassDestination({ ...ONLINE, channelIds: ['gone'] }, CHANNELS)).toEqual(
      {
        text: 'Никуда не уходит — выберите канал',
        isWarning: true,
      },
    );
  });

  it('«офлайн + онлайн» без каналов — тоже предупреждение', () => {
    expect(
      formatClassDestination({ ...ONLINE, format: 'both' }, CHANNELS)?.isWarning,
    ).toBe(true);
  });

  it('офлайн без каналов — строки нет: рассылать нечего', () => {
    expect(formatClassDestination({ ...ONLINE, format: 'offline' }, CHANNELS)).toBeNull();
  });

  it('выключенное занятие без каналов — без предупреждения', () => {
    expect(formatClassDestination({ ...ONLINE, active: false }, CHANNELS)).toBeNull();
  });

  it('выключенное занятие с каналами — стрелка остаётся', () => {
    expect(
      formatClassDestination({ ...ONLINE, active: false, channelIds: ['ch1'] }, CHANNELS)
        ?.isWarning,
    ).toBe(false);
  });

  it('каналы ещё грузятся (null) — строки нет, не ложное предупреждение', () => {
    expect(formatClassDestination(ONLINE, null)).toBeNull();
  });
});
