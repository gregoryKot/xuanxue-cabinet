// Юнит без Mongo и DI (CLAUDE.md «Тесты») — чистая сборка payload/`$set`,
// шифрование и запись уже проверены в channels.service.spec.ts.
import { buildChannelCreatePayload, buildChannelUpdateSet } from './channel-write';

describe('buildChannelCreatePayload', () => {
  it('поля из CreateChannelInput, active: true по умолчанию, тегов нет (ADR-0192)', () => {
    const payload = buildChannelCreatePayload(
      { type: 'telegram', title: 'Канал', config: { chatId: '@x' } },
      '@x',
    );

    expect(payload).toEqual({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@x' },
      target: '@x',
      active: true,
    });
  });
});

describe('buildChannelUpdateSet', () => {
  it('переданные поля попадают в $set как есть, остальных нет', () => {
    const $set = buildChannelUpdateSet({ title: 'Новое имя' });

    expect($set).toEqual({ title: 'Новое имя' });
  });
});
