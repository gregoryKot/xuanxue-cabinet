import { describe, expect, it } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import {
  initialChannelFormState,
  toCreateInput,
  toUpdateInput,
  validateChannelForm,
} from './channelFormInput';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('initialChannelFormState', () => {
  it('создание — тип по умолчанию vk, пустые поля', () => {
    const state = initialChannelFormState(null);
    expect(state.type).toBe('vk');
    expect(state.title).toBe('');
    expect(state.token).toBe('');
  });

  it('правка telegram — chatId предзаполнен из target, secret-полей нет', () => {
    const state = initialChannelFormState(
      makeChannel({ type: 'telegram', target: '@school_channel' }),
    );
    expect(state.chatId).toBe('@school_channel');
  });

  it('правка vk — peerId предзаполнен из target, токен пустой', () => {
    const state = initialChannelFormState(makeChannel({ type: 'vk', target: '777' }));
    expect(state.peerIdText).toBe('777');
    expect(state.token).toBe('');
  });

  it('правка manual — chatId/peerId пустые', () => {
    const state = initialChannelFormState(makeChannel({ type: 'manual', target: '' }));
    expect(state.chatId).toBe('');
    expect(state.peerIdText).toBe('');
  });

  it('канал webpush (защита типов — этот экран его не создаёт) — резерв manual', () => {
    const state = initialChannelFormState(makeChannel({ type: 'webpush', target: '' }));
    expect(state.type).toBe('manual');
  });
});

describe('validateChannelForm', () => {
  it('пустое название — ошибка на поле title', () => {
    const state = initialChannelFormState(null);
    const error = validateChannelForm(state, true);
    expect(error?.field).toBe('title');
    expect(error?.message).toMatch(/название/);
  });

  it('telegram без chatId — ошибка на поле chatId', () => {
    const state = {
      ...initialChannelFormState(null),
      type: 'telegram' as const,
      title: 'X',
    };
    const error = validateChannelForm(state, true);
    expect(error?.field).toBe('chatId');
  });

  it('создание vk без токена — ошибка на поле token', () => {
    const state = {
      ...initialChannelFormState(null),
      title: 'X',
      peerIdText: '1',
    };
    const error = validateChannelForm(state, true);
    expect(error?.field).toBe('token');
    expect(error?.message).toMatch(/токен/);
  });

  it('vk с нечисловым peerId — ошибка на поле peerIdText', () => {
    const state = {
      ...initialChannelFormState(null),
      title: 'X',
      token: 't',
      peerIdText: 'x',
    };
    const error = validateChannelForm(state, true);
    expect(error?.field).toBe('peerIdText');
    expect(error?.message).toMatch(/целое число/);
  });

  it('правка vk без токена, ID беседы не менялся — валидно (токен менять не обязаны)', () => {
    const channel = makeChannel({ type: 'vk', target: '777' });
    const state = { ...initialChannelFormState(channel), title: 'X' };
    expect(validateChannelForm(state, false, channel)).toBeNull();
  });

  it('правка vk без токена, ID беседы изменён — ошибка «введите токен заново» (ревью п.2)', () => {
    const channel = makeChannel({ type: 'vk', target: '777' });
    const state = { ...initialChannelFormState(channel), title: 'X', peerIdText: '888' };
    const error = validateChannelForm(state, false, channel);
    expect(error?.field).toBe('peerIdText');
    expect(error?.message).toMatch(/введите токен заново/);
  });

  it('правка vk с токеном и изменённым ID беседы — валидно (токен переписывает config целиком)', () => {
    const channel = makeChannel({ type: 'vk', target: '777' });
    const state = {
      ...initialChannelFormState(channel),
      title: 'X',
      token: 'newsecret',
      peerIdText: '888',
    };
    expect(validateChannelForm(state, false, channel)).toBeNull();
  });

  it('правка без явного existing — берёт тип из state (защита типов)', () => {
    const state = { ...initialChannelFormState(null), title: 'X', peerIdText: '1' };
    expect(validateChannelForm(state, false)).toBeNull();
  });

  it('manual — валидно без дополнительных полей', () => {
    const state = { ...initialChannelFormState(null), title: 'Facebook' };
    expect(validateChannelForm({ ...state, type: 'manual' }, true)).toBeNull();
  });
});

describe('toCreateInput', () => {
  it('telegram — config.chatId', () => {
    const state = {
      ...initialChannelFormState(null),
      type: 'telegram' as const,
      title: 'Канал',
      chatId: '@school',
    };
    expect(toCreateInput(state)).toEqual({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@school' },
    });
  });

  it('vk — config.token и config.peerId числом', () => {
    const state = {
      ...initialChannelFormState(null),
      title: 'ВК',
      token: 'secret',
      peerIdText: '42',
    };
    expect(toCreateInput(state)).toEqual({
      type: 'vk',
      title: 'ВК',
      config: { token: 'secret', peerId: 42 },
    });
  });

  it('manual — config пустой объект', () => {
    const state = {
      ...initialChannelFormState(null),
      type: 'manual' as const,
      title: 'FB',
    };
    expect(toCreateInput(state)).toEqual({ type: 'manual', title: 'FB', config: {} });
  });

  it('название не режется молча — сохраняется как есть, ограничение только на инпуте (ревью п.15)', () => {
    const longTitle = 'а'.repeat(200);
    const state = {
      ...initialChannelFormState(null),
      type: 'manual' as const,
      title: longTitle,
    };
    expect(toCreateInput(state).title).toBe(longTitle);
  });
});

describe('toUpdateInput', () => {
  it('выключенный канал — active: false уходит вместе с названием', () => {
    const state = { ...initialChannelFormState(makeChannel()), active: false };
    expect(toUpdateInput(state, 'vk')).toEqual({ title: 'ВК школы', active: false });
  });

  it('telegram — config всегда отправляется (не секрет)', () => {
    const state = {
      ...initialChannelFormState(null),
      title: 'Канал',
      chatId: '-100123',
    };
    expect(toUpdateInput(state, 'telegram')).toEqual({
      title: 'Канал',
      active: true,
      config: { chatId: '-100123' },
    });
  });

  it('vk без токена — config отсутствует', () => {
    const state = { ...initialChannelFormState(null), title: 'ВК', peerIdText: '5' };
    expect(toUpdateInput(state, 'vk')).toEqual({ title: 'ВК', active: true });
  });

  it('vk с токеном — config уходит целиком', () => {
    const state = {
      ...initialChannelFormState(null),
      title: 'ВК',
      token: 'newsecret',
      peerIdText: '5',
    };
    expect(toUpdateInput(state, 'vk')).toEqual({
      title: 'ВК',
      active: true,
      config: { token: 'newsecret', peerId: 5 },
    });
  });

  it('manual — config отсутствует', () => {
    const state = { ...initialChannelFormState(null), title: 'FB' };
    expect(toUpdateInput(state, 'manual')).toEqual({ title: 'FB', active: true });
  });
});
