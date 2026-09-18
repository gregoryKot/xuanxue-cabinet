// Убирает длительность из шаблона поста с записью у школы, которая его не
// правила (отзыв владельца 2026-09-12: «когда отправляем видео, время не
// нужно описывать»).
//
// Одной правки дефолта в коде мало: `SettingsService.get()` при первом
// обращении кладёт копию шаблонов в базу, и дальше пост собирается из неё.
// Поэтому меняем ровно тот текст, который совпадает со старым дефолтом
// слово в слово; изменённый учителем шаблон — его выбор, трогать нельзя
// (CLAUDE.md, «Посты выглядят как сейчас»).
//
// Старый и новый тексты лежат здесь константами, а не берутся из
// `shared/src/default-templates.ts`: иначе следующая правка дефолта
// незаметно переопределит смысл сравнения и миграция начнёт менять то, чего
// не собиралась.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const SETTINGS = 'settings';

const OLD_RECORDING_TEMPLATE =
  '{название}[: {тема}][. Занятие {длительность}][, ведёт {ведущий}][ — {ссылка}]';
const NEW_RECORDING_TEMPLATE = '{название}[: {тема}][, ведёт {ведущий}][ — {ссылка}]';

export const recordingTemplateWithoutDuration = {
  id: '0005-recording-template-without-duration',
  async up(db: Db): Promise<void> {
    // Идемпотентность бесплатная: второй запуск не найдёт старый текст.
    await db.collection(SETTINGS).updateMany(
      { 'templates.recording': OLD_RECORDING_TEMPLATE },
      {
        $set: { 'templates.recording': NEW_RECORDING_TEMPLATE, updatedAt: new Date() },
      },
    );
  },
};
