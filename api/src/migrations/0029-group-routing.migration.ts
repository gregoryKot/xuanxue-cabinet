// Один рычаг рассылки — группа (ADR-0195, владелец 2026-11-04). До этого занятие
// несло несколько групп (`groupIds`, ADR-0193) и список каналов (`channelIds`,
// галочки «занятие ↔ канал»). Теперь у занятия одна группа или «для всех групп»,
// у канала одна группа, и занятие уходит в каналы с той же группой.
//
// Правила.
// (а) Канал школы: берутся занятия, где он отмечен в `channelIds`, у которых
//     ровно одна группа; если их группа одна и та же — она становится группой
//     канала; нет такой группы или их несколько — группы нет, канал идёт в отчёт.
//     Личные чаты учеников (`broadcastEligible: false`) группы не получают.
//     Канал, у которого поле `groupId` уже есть, пропускается.
// (б) Занятие: одна группа — она в `groupId`; две и больше — `forAllGroups`
//     (так на сайте школы записано пятничное «все группы»), подпись «все
//     группы»; ни одной — без группы. `groupIds` снимается. Занятие, у которого
//     уже есть `groupId` или `forAllGroups`, пропускается.
// Каналы идут первыми: правило (а) читает `groupIds`, а (б) их снимает.
//
// `classes.channelIds` НЕ снимается: на время выката старый код ещё читает его
// (expand → deploy → contract); новая схема поле не знает и игнорирует. Снять
// его можно отдельной миграцией после выката. Идемпотентна: повтор не находит
// занятий с `groupIds` и каналов без решения о группе, у которых нашлось бы что
// проставить. Отчёт называет id и подпись — владелец поправит спорное руками.
import type { mongo } from 'mongoose';
import { ALL_GROUPS_LABEL } from '@xuanxue/shared';

type Db = mongo.Db;

const CHANNELS = 'channels';
const CLASSES = 'classes';
const GROUPS = 'groups';

interface LegacyClass {
  _id: mongo.ObjectId;
  title?: string;
  groupLabel?: string;
  groupIds?: mongo.ObjectId[];
  channelIds?: mongo.ObjectId[];
}

interface SchoolChannel {
  _id: mongo.ObjectId;
  title?: string;
}

export const groupRouting = {
  id: '0029-group-routing',
  async up(db: Db): Promise<string[]> {
    const channels = db.collection<SchoolChannel>(CHANNELS);
    const classes = db.collection<LegacyClass>(CLASSES);
    const report: string[] = [];

    const legacy = await classes
      .find({ groupIds: { $exists: true } })
      .project<LegacyClass>({ groupIds: 1, channelIds: 1 })
      .toArray();

    // (а) Группа канала — из занятий ровно одной группы, где он отмечен.
    const groupsOfChannel = new Map<string, Map<string, mongo.ObjectId>>();
    for (const cls of legacy) {
      const [groupId, ...rest] = cls.groupIds ?? [];
      if (groupId === undefined || rest.length > 0) continue;
      for (const channelId of cls.channelIds ?? []) {
        const found =
          groupsOfChannel.get(String(channelId)) ?? new Map<string, mongo.ObjectId>();
        found.set(String(groupId), groupId);
        groupsOfChannel.set(String(channelId), found);
      }
    }
    const names = new Map(
      (await db.collection<{ name: string }>(GROUPS).find().toArray()).map((group) => [
        String(group._id),
        group.name,
      ]),
    );
    const undecided = channels.find({
      broadcastEligible: { $ne: false },
      groupId: { $exists: false },
    });
    for await (const channel of undecided) {
      const found = [...(groupsOfChannel.get(String(channel._id))?.values() ?? [])];
      const only = found.length === 1 ? found[0] : undefined;
      if (only !== undefined) {
        await channels.updateOne(
          { _id: channel._id, groupId: { $exists: false } },
          { $set: { groupId: only } },
        );
        continue;
      }
      const why = found.length === 0 ? 'группа не определена' : `групп: ${found.length}`;
      report.push(
        `канал «${channel.title ?? ''}» (${String(channel._id)}) без группы — ${why}`,
      );
    }

    // (б) Занятия.
    let migrated = 0;
    for (const cls of legacy) {
      const own = cls.groupIds ?? [];
      const set: Record<string, unknown> = {};
      if (own.length === 1) {
        set.groupId = own[0];
        set.forAllGroups = false;
        set.groupLabel = names.get(String(own[0])) ?? '';
      } else if (own.length >= 2) {
        set.forAllGroups = true;
        set.groupLabel = ALL_GROUPS_LABEL;
      } else {
        set.forAllGroups = false;
        set.groupLabel = '';
      }
      await classes.updateOne(
        {
          _id: cls._id,
          groupId: { $exists: false },
          forAllGroups: { $exists: false },
        },
        { $set: set, $unset: { groupIds: '' } },
      );
      migrated += 1;
    }
    report.unshift(`занятий переведено на группы: ${migrated}`);
    return report;
  },
};
