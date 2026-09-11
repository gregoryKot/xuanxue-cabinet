// Подключает активные Telegram-каналы к занятиям, у которых каналов нет.
//
// Дыра, из-за которой на проде не ушло ни одной ссылки (отзыв владельца
// 2026-09-11: «бот давно добавлен, но ничего не уходит»). Чат становится
// каналом в момент добавления бота и тогда же подписывается на все активные
// занятия (ADR-0015) — но бота добавили раньше, чем появились занятия. Занятия
// приехали миграцией 0001 сырыми документами, мимо ClassesService.create,
// который как раз и подставляет активные каналы новому занятию. В итоге у
// канала не было занятий, у занятий — каналов, и планировщик каждый тик
// отменял рассылку с причиной «у класса нет каналов рассылки».
//
// Трогаем только занятия с ПУСТЫМ списком: непустой — это выбор учителя
// (ADR-0015: повторное добавление бота не отменяет отключённые им классы), а
// пустой список — не состояние, которое кто-то выбирал: «Сводка» считает такие
// занятия отдельным числом именно как поломку.
import type { Db } from 'mongodb';

const CLASSES = 'classes';
const CHANNELS = 'channels';

export const attachChannelsToClasses = {
  id: '0004-attach-channels-to-classes',
  async up(db: Db): Promise<void> {
    // Тот же отбор, что у ClassesService.defaultTelegramChannelIds().
    const channels = await db
      .collection(CHANNELS)
      .find({ type: 'telegram', active: true }, { projection: { _id: 1 } })
      .toArray();
    if (channels.length === 0) return; // бота ещё никуда не добавили

    await db.collection(CLASSES).updateMany(
      { active: true, channelIds: { $size: 0 } },
      {
        $addToSet: { channelIds: { $each: channels.map((channel) => channel._id) } },
        $set: { updatedAt: new Date() },
      },
    );
  },
};
