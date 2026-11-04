// Юнит без Mongo и DI (CLAUDE.md «Тесты») — сборка payload и команды PATCH там,
// где группа не ищется в базе (`undefined`, `null`); выбор существующей группы,
// шифрование и запись проверены на настоящей Mongo в channels.service.spec.ts.
import type { Model } from 'mongoose';
import type { GroupRecord } from '../groups/group.schema';
import { buildChannelCreatePayload, buildChannelUpdate } from './channel-write';

// Группа в базе не нужна ни одному из случаев ниже: модель не должна вызываться.
const NO_GROUP_LOOKUP = {
  findOne: () => {
    throw new Error('группа не должна искаться');
  },
} as unknown as Model<GroupRecord>;

describe('buildChannelCreatePayload', () => {
  it('поля из CreateChannelInput, active: true по умолчанию, группы и тегов нет', async () => {
    const payload = await buildChannelCreatePayload(
      NO_GROUP_LOOKUP,
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

  it('groupId: null при создании — то же, что без группы', async () => {
    const payload = await buildChannelCreatePayload(
      NO_GROUP_LOOKUP,
      { type: 'manual', title: 'Канал', config: {}, groupId: null },
      '',
    );

    expect(payload).not.toHaveProperty('groupId');
  });
});

describe('buildChannelUpdate', () => {
  it('переданные поля попадают в $set как есть, остальных и $unset нет', async () => {
    const update = await buildChannelUpdate(NO_GROUP_LOOKUP, {
      title: 'Новое имя',
    });

    expect(update).toEqual({ $set: { title: 'Новое имя' } });
  });

  it('groupId: null — группа уходит в $unset, а не пишется литералом null (ADR-0195)', async () => {
    const update = await buildChannelUpdate(NO_GROUP_LOOKUP, { groupId: null });

    expect(update).toEqual({ $set: {}, $unset: { groupId: '' } });
  });
});
