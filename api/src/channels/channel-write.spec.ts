// Юнит без Mongo и DI (CLAUDE.md «Тесты») — чистая сборка payload/`$set`,
// шифрование и запись уже проверены в channels.service.spec.ts.
import { buildChannelCreatePayload, buildChannelUpdateSet } from './channel-write';

describe('buildChannelCreatePayload', () => {
  it('tags не прислали — нормализованный пустой массив (канал получает всё)', () => {
    const payload = buildChannelCreatePayload(
      { type: 'manual', title: 'Facebook', config: {} },
      '',
    );

    expect(payload.tags).toEqual([]);
  });

  it('tags нормализуются: обрезка пробелов и дедуп без учёта регистра', () => {
    const payload = buildChannelCreatePayload(
      {
        type: 'manual',
        title: 'Facebook',
        config: {},
        tags: [' Новички ', 'новички'],
      },
      '',
    );

    expect(payload.tags).toEqual(['Новички']);
  });

  it('остальные поля — из CreateChannelInput, active: true по умолчанию', () => {
    const payload = buildChannelCreatePayload(
      { type: 'telegram', title: 'Канал', config: { chatId: '@x' } },
      '@x',
    );

    expect(payload).toMatchObject({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@x' },
      target: '@x',
      active: true,
    });
  });
});

describe('buildChannelUpdateSet', () => {
  it('tags не прислали — поля нет в $set (PATCH их не трогает)', () => {
    const $set = buildChannelUpdateSet({ title: 'Новое имя' });

    expect($set).not.toHaveProperty('tags');
  });

  it('tags прислали пустым массивом — сбрасывает', () => {
    const $set = buildChannelUpdateSet({ tags: [] });

    expect($set.tags).toEqual([]);
  });

  it('tags нормализуются при обновлении', () => {
    const $set = buildChannelUpdateSet({ tags: [' средние ', 'средние'] });

    expect($set.tags).toEqual(['средние']);
  });
});
