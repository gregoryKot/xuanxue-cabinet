// Теги у каналов убраны (ADR-0192, владелец 2026-11-04): куда уходит занятие,
// решают только галочки «занятие ↔ канал» (`classes.channelIds`). Тег канала был
// вторым, невидимым фильтром поверх галочки: занятие отмечено, а пост молча не
// уходил. Чтобы маршруты остались теми же, фильтр превращается в галочки.
//
// Правило. Для каждого канала с непустым `tags`: у каждого занятия, где этот
// канал отмечен (`channelIds`), и чьи теги НЕ пересекаются с тегами канала без
// учёта регистра, галочка снимается (`$pull`). Занятие без тегов не пересекается
// ни с чем — канал с тегами его и раньше не получал. Затем у всех каналов
// удаляется поле `tags`.
//
// Принятая потеря: раньше канал мог принять дату занятия по её СОБСТВЕННОМУ тегу
// (`lessons.tags`), даже если тегов у занятия в расписании не было. Исключение для
// одной даты галочками не выразить, поэтому такие даты теперь идут так же, как их
// занятие в расписании.
//
// Идемпотентна: после первого запуска у каналов нет `tags`, второй не находит ни
// каналов, ни связей. Если запуск оборвался между снятием галочек и удалением
// поля, повтор доделает остаток. Совместима со старым кодом, который работает
// во время деплоя: канал без `tags` он считает «принимает всё», а снятые
// галочки дают тот же маршрут, что давал фильтр. В отчёт идут только id.
import type { mongo } from 'mongoose';

type Db = mongo.Db;

const CHANNELS = 'channels';
const CLASSES = 'classes';

interface TaggedChannel {
  _id: mongo.ObjectId;
  tags: string[];
}

interface LinkedClass {
  _id: mongo.ObjectId;
  channelIds: mongo.ObjectId[];
  tags?: string[];
}

function lowered(tags: readonly string[] | undefined): Set<string> {
  return new Set((tags ?? []).map((tag) => tag.toLowerCase()));
}

async function pruneChannelLinks(db: Db, channel: TaggedChannel): Promise<number> {
  const channelTags = lowered(channel.tags);
  const linked = await db
    .collection<LinkedClass>(CLASSES)
    .find({ channelIds: channel._id }, { projection: { tags: 1 } })
    .toArray();
  const unmatchedIds = linked
    .filter((cls) => ![...lowered(cls.tags)].some((tag) => channelTags.has(tag)))
    .map((cls) => cls._id);
  if (unmatchedIds.length === 0) return 0;
  const { modifiedCount } = await db
    .collection<LinkedClass>(CLASSES)
    .updateMany(
      { _id: { $in: unmatchedIds } },
      { $pull: { channelIds: channel._id }, $set: { updatedAt: new Date() } },
    );
  return modifiedCount;
}

export const channelTagsIntoClassLinks = {
  id: '0026-channel-tags-into-class-links',
  async up(db: Db): Promise<string[]> {
    const tagged = await db
      .collection<TaggedChannel>(CHANNELS)
      .find({ 'tags.0': { $exists: true } }, { projection: { tags: 1 } })
      .toArray();

    const report: string[] = [];
    for (const channel of tagged) {
      const pruned = await pruneChannelLinks(db, channel);
      report.push(`канал ${channel._id.toString()}: снято галочек у занятий — ${pruned}`);
    }
    await db.collection(CHANNELS).updateMany({}, { $unset: { tags: 1 } });
    return report;
  },
};
