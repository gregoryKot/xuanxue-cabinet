// Несколько групп у занятия и у канала (ADR-0196, владелец 2026-11-04: «Если мне
// две группы надо?»). До этого занятие несло одну группу (`groupId`) или признак
// «для всех» (`forAllGroups`, ADR-0195), канал — одну `groupId`. Теперь у обоих
// `groupIds` — массив, и занятие уходит в канал, если массивы пересекаются.
//
// Правила.
// (а) Занятие: `forAllGroups: true` — все группы школы в порядке создания;
//     `groupId` — `[groupId]`; иначе `[]`. `groupLabel` пересобирается из
//     названий (через запятую). `groupId` и `forAllGroups` снимаются.
// (б) Канал: `groupId` — `[groupId]`, иначе `[]`; `groupId` снимается.
// Документ, у которого `groupIds` уже есть, пропускается — повтор ничего не меняет.
//
// Expand → contract: на время выката старый инстанс ещё читает `groupId` и
// `forAllGroups`, которых уже нет, и несколько секунд считает такие занятия и
// каналы «без группы» (посты в эти секунды не уходят; планировщик тикает раз в
// минуту, а окно отправки шире). Приемлемо и описано в ADR-0196.
import type { mongo } from 'mongoose';

type Db = mongo.Db;

const CHANNELS = 'channels';
const CLASSES = 'classes';
const GROUPS = 'groups';
const LABEL_SEPARATOR = ', ';

interface LegacyClass {
  _id: mongo.ObjectId;
  groupId?: mongo.ObjectId;
  forAllGroups?: boolean;
}

interface LegacyChannel {
  _id: mongo.ObjectId;
  groupId?: mongo.ObjectId;
}

export const classGroupIds = {
  id: '0030-class-group-ids',
  async up(db: Db): Promise<string[]> {
    const groups = await db
      .collection<{ name: string }>(GROUPS)
      .find()
      .sort({ _id: 1 })
      .toArray();
    const names = new Map(groups.map((group) => [String(group._id), group.name]));
    const everyGroup = groups.map((group) => group._id);

    const classes = db.collection<LegacyClass>(CLASSES);
    let migratedClasses = 0;
    for await (const cls of classes.find({ groupIds: { $exists: false } })) {
      const groupIds = cls.forAllGroups ? everyGroup : cls.groupId ? [cls.groupId] : [];
      const groupLabel = groupIds
        .map((id) => names.get(String(id)) ?? '')
        .join(LABEL_SEPARATOR);
      await classes.updateOne(
        { _id: cls._id, groupIds: { $exists: false } },
        { $set: { groupIds, groupLabel }, $unset: { groupId: '', forAllGroups: '' } },
      );
      migratedClasses += 1;
    }

    const channels = db.collection<LegacyChannel>(CHANNELS);
    let migratedChannels = 0;
    for await (const channel of channels.find({ groupIds: { $exists: false } })) {
      await channels.updateOne(
        { _id: channel._id, groupIds: { $exists: false } },
        {
          $set: { groupIds: channel.groupId ? [channel.groupId] : [] },
          $unset: { groupId: '' },
        },
      );
      migratedChannels += 1;
    }

    return [
      `занятий переведено на несколько групп: ${migratedClasses}`,
      `каналов переведено на несколько групп: ${migratedChannels}`,
    ];
  },
};
