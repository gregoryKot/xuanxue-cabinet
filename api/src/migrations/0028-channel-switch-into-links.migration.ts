// Выключатель у канала убран (ADR-0194, владелец 2026-11-04): куда уходит
// занятие, решают только галочки «занятие ↔ канал» (`classes.channelIds`).
// «Выключен» был вторым способом молча не слать, невидимым в расписании.
// Чтобы маршруты остались теми же, выключатель превращается в галочки.
//
// Правило. Для каждого канала школы (`broadcastEligible` не false) с
// `active: false`: его id снимается у всех занятий (`$pull` из `channelIds`),
// затем канал получает `active: true`. Личные чаты учеников не трогаем: у них
// `active: false` значит «ученик заблокировал бота» (ADR-0027), это другое.
//
// Идемпотентна: после запуска выключенных каналов школы нет, второй запуск
// ничего не находит. Если запуск оборвался между снятием галочек и включением
// канала, повтор доделает остаток. Совместима со старым кодом на время деплоя:
// он читает `active`, который теперь true, а маршрут тот же — галочек нет.
// В отчёт идут только id.
import type { mongo } from 'mongoose';

type Db = mongo.Db;

const CHANNELS = 'channels';
const CLASSES = 'classes';

interface SwitchedOffChannel {
  _id: mongo.ObjectId;
}

interface LinkedClass {
  channelIds: mongo.ObjectId[];
}

export const channelSwitchIntoLinks = {
  id: '0028-channel-switch-into-links',
  async up(db: Db): Promise<string[]> {
    const off = await db
      .collection<SwitchedOffChannel>(CHANNELS)
      .find(
        { active: false, broadcastEligible: { $ne: false } },
        { projection: { _id: 1 } },
      )
      .toArray();

    const report: string[] = [];
    for (const channel of off) {
      const { modifiedCount } = await db
        .collection<LinkedClass>(CLASSES)
        .updateMany(
          { channelIds: channel._id },
          { $pull: { channelIds: channel._id }, $set: { updatedAt: new Date() } },
        );
      await db
        .collection(CHANNELS)
        .updateOne({ _id: channel._id }, { $set: { active: true } });
      report.push(`канал ${channel._id.toString()}: снято галочек — ${modifiedCount}`);
    }
    return report;
  },
};
