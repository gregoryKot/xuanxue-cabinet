// Юнит без Mongo и DI (CLAUDE.md «Тесты») — сборка payload и команды PATCH там,
// где группа не ищется в базе (нет полей, `[]`); выбор существующей группы,
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
  it('поля из CreateChannelInput, active: true по умолчанию, групп нет', async () => {
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
      groupIds: [],
    });
  });

  it('groupIds: [] при создании — то же, что без групп', async () => {
    const payload = await buildChannelCreatePayload(
      NO_GROUP_LOOKUP,
      { type: 'manual', title: 'Канал', config: {}, groupIds: [] },
      '',
    );

    expect(payload).toHaveProperty('groupIds', []);
  });
});

describe('buildChannelUpdate', () => {
  it('переданные поля попадают в $set как есть, групп без поля не трогаем', async () => {
    const update = await buildChannelUpdate(NO_GROUP_LOOKUP, {
      title: 'Новое имя',
    });

    expect(update).toEqual({ $set: { title: 'Новое имя' } });
  });

  it('groupIds: [] — группы снимаются пустым списком (ADR-0196)', async () => {
    const update = await buildChannelUpdate(NO_GROUP_LOOKUP, { groupIds: [] });

    expect(update).toEqual({ $set: { groupIds: [] } });
  });
});
