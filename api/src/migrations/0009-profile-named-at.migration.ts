// Первый вход спрашивает имя только один раз (ADR-0044, PATCH /me/profile):
// человек, который уже входил до этого PR, второй раз про имя не
// спрашивается. `profileNamedAt = createdAt` ставим только тем, чьё `name`
// уже настоящее — не совпадает с их же `email` (`$expr`, а не поле в
// фильтре: сравнить два поля друг с другом фильтр без агрегации не умеет).
// У людей из Telegram email не задан вовсе — `$email` в `$expr` тогда null,
// сравнение со строкой имени всегда даёт «не равно», то есть условие для
// них верно. Тем, у кого name === email (старые входы по почте —
// EmailLoginUserService писал в name сам адрес до этого PR), поле не
// ставим — кабинет спросит имя на следующем входе экраном `/welcome`, и
// адрес почты (ключ входа, SECURITY §1) перестанет быть тем, что видят в
// «Учениках» и в приветствии.
//
// Идемпотентна по построению — фильтр на `profileNamedAt: { $exists: false }`,
// второй запуск не находит ни одного документа без поля.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const USERS = 'users';

export const profileNamedAt = {
  id: '0009-profile-named-at',
  async up(db: Db): Promise<void> {
    // Update-пайплайн (массив, не объект `$set`), потому что значение
    // нового поля берётся из другого поля того же документа (`$createdAt`)
    // — обычный update-оператор так не умеет, только агрегационный `$set`.
    await db
      .collection(USERS)
      .updateMany(
        { profileNamedAt: { $exists: false }, $expr: { $ne: ['$name', '$email'] } },
        [{ $set: { profileNamedAt: '$createdAt' } }],
      );
  },
};
