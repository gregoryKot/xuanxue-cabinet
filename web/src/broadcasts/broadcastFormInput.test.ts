import { describe, expect, it } from 'vitest';
import { BROADCAST_LIMITS } from '@xuanxue/shared';
import {
  initialBroadcastFormState,
  toCreateInput,
  validateBroadcastForm,
} from './broadcastFormInput';

describe('validateBroadcastForm', () => {
  it('пустой текст — ошибка под полем text', () => {
    const state = initialBroadcastFormState();
    const error = validateBroadcastForm(state);
    expect(error?.field).toBe('text');
    expect(error?.message).toMatch(/текст/);
  });

  it('слишком длинный текст — ошибка с лимитом под полем text', () => {
    const state = {
      ...initialBroadcastFormState(),
      text: 'a'.repeat(BROADCAST_LIMITS.text + 1),
      channelIds: ['c1'],
    };
    const error = validateBroadcastForm(state);
    expect(error?.field).toBe('text');
    expect(error?.message).toMatch(String(BROADCAST_LIMITS.text));
  });

  it('без каналов — ошибка под полем channelIds', () => {
    const state = { ...initialBroadcastFormState(), text: 'Текст' };
    const error = validateBroadcastForm(state);
    expect(error?.field).toBe('channelIds');
    expect(error?.message).toMatch(/канал/);
  });

  it('каналов больше лимита — ошибка под полем channelIds', () => {
    const state = {
      ...initialBroadcastFormState(),
      text: 'Текст',
      channelIds: Array.from(
        { length: BROADCAST_LIMITS.channelsMax + 1 },
        (_, i) => `c${i}`,
      ),
    };
    const error = validateBroadcastForm(state);
    expect(error?.field).toBe('channelIds');
    expect(error?.message).toMatch(String(BROADCAST_LIMITS.channelsMax));
  });

  it('время в будущем без указанной даты — ошибка под полем scheduledAtLocal', () => {
    const state = {
      ...initialBroadcastFormState(),
      text: 'Текст',
      channelIds: ['c1'],
      scheduleNow: false,
    };
    const error = validateBroadcastForm(state);
    expect(error?.field).toBe('scheduledAtLocal');
    expect(error?.message).toMatch(/время отправки/i);
  });

  it('нераспознаваемая дата — отдельная ошибка под полем scheduledAtLocal', () => {
    const state = {
      ...initialBroadcastFormState(),
      text: 'Текст',
      channelIds: ['c1'],
      scheduleNow: false,
      scheduledAtLocal: 'не дата',
    };
    const error = validateBroadcastForm(state);
    expect(error?.field).toBe('scheduledAtLocal');
    expect(error?.message).toMatch(/указаны неверно|указано неверно/);
  });

  it('валидная форма — null', () => {
    const state = { ...initialBroadcastFormState(), text: 'Текст', channelIds: ['c1'] };
    expect(validateBroadcastForm(state)).toBeNull();
  });
});

describe('toCreateInput', () => {
  it('«сейчас» — scheduledAt не отправляется', () => {
    const state = { ...initialBroadcastFormState(), text: 'Текст', channelIds: ['c1'] };
    expect(toCreateInput(state)).toEqual({ text: 'Текст', channelIds: ['c1'] });
  });

  it('на время — scheduledAt в ISO UTC', () => {
    const state = {
      ...initialBroadcastFormState(),
      text: 'Текст',
      channelIds: ['c1'],
      scheduleNow: false,
      scheduledAtLocal: '2026-09-08T19:00',
    };
    const input = toCreateInput(state);
    expect(input.scheduledAt).toMatch(/Z$/);
  });

  it('нераспознаваемая дата — scheduledAt отсутствует (защита в глубину)', () => {
    const state = {
      ...initialBroadcastFormState(),
      text: 'Текст',
      channelIds: ['c1'],
      scheduleNow: false,
      scheduledAtLocal: 'не дата',
    };
    expect(toCreateInput(state).scheduledAt).toBeUndefined();
  });
});
