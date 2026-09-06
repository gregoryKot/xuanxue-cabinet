import { CHANNEL_LIMITS } from '@xuanxue/shared';
import { assertConfigForType } from './assert-channel-config';

describe('assertConfigForType', () => {
  it('telegram: валидный chatId проходит', () => {
    expect(() => assertConfigForType('telegram', { chatId: '@school' })).not.toThrow();
  });

  it('telegram: пустой chatId — InvalidInputError', () => {
    expect(() => assertConfigForType('telegram', { chatId: '  ' })).toThrow('chatId');
  });

  it('telegram: конфиг ВК под видом telegram — InvalidInputError', () => {
    expect(() => assertConfigForType('telegram', { token: 't', peerId: 1 })).toThrow(
      'chatId',
    );
  });

  it('telegram: chatId длиннее лимита — InvalidInputError', () => {
    const chatId = '@' + 'a'.repeat(CHANNEL_LIMITS.chatId);
    expect(() => assertConfigForType('telegram', { chatId })).toThrow('длиннее');
  });

  it('telegram: лишнее поле в config — InvalidInputError с именем поля', () => {
    const config = { chatId: '@school', extra: 'y' };
    expect(() => assertConfigForType('telegram', config)).toThrow('extra');
  });

  it('vk: валидный токен и peerId проходят', () => {
    expect(() => assertConfigForType('vk', { token: 'tok', peerId: 123 })).not.toThrow();
  });

  it('vk: peerId не целое число — InvalidInputError', () => {
    expect(() => assertConfigForType('vk', { token: 'tok', peerId: 1.5 })).toThrow('ВК');
  });

  it('vk: пустой токен — InvalidInputError', () => {
    expect(() => assertConfigForType('vk', { token: '', peerId: 1 })).toThrow('ВК');
  });

  it('vk: лишнее поле в config — InvalidInputError с именем поля', () => {
    const config = { token: 'tok', peerId: 1, extra: 'y' };
    expect(() => assertConfigForType('vk', config)).toThrow('extra');
  });

  it('manual: пустой config проходит', () => {
    expect(() => assertConfigForType('manual', {})).not.toThrow();
  });

  it('manual: непустой config — InvalidInputError', () => {
    expect(() => assertConfigForType('manual', { chatId: '@x' })).toThrow('config');
  });

  it('webpush: всегда InvalidInputError — эндпоинт его не создаёт', () => {
    expect(() => assertConfigForType('webpush', {})).toThrow('webpush');
  });
});
