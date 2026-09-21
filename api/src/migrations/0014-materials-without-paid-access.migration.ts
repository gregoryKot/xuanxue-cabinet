// Доступа по оплате нет (ADR-0096, отменяет ADR-0048): рубильник школы
// `settings.materialsPaidAccess` и отметка материала `access: 'paid'`
// удалены из кода этим же PR (CLAUDE.md «Отказались от механики — удаляем с
// концами»). Эта миграция приводит данные к тому же решению — иначе
// значения остались бы в базе и однажды кто-нибудь начал бы на них
// опираться (тот же довод, что у миграции 0010).
//
// Два независимых действия:
// - `settings`: `$unset` поля `materialsPaidAccess`, если оно есть —
//   рубильника в контракте `SettingsDto` больше нет, читать его некому.
// - `materials`: материалы с `access: 'paid'` переводятся в `access: 'all'`.
//   Это не примерное решение, а факт, который уже был в силе: рубильник по
//   умолчанию был выключен, оплат в кабинете не было ни дня (ADR-0048,
//   раздел «Контекст»), и включённый рубильник закрывал `paid` ВСЕМ
//   ученикам без исключения (`isMaterialLocked`, `api/src/materials/
//   material-access.ts` до этого PR) — то есть `paid` и `all` уже вели себя
//   как одно и то же значение, миграция просто называет вещь тем именем,
//   под которым она была видна всем.
//
// Безопасно при деплое и при откате: старый инстанс, который ещё отвечает
// во время раскатки, читает отсутствующий `materialsPaidAccess` через
// значение по умолчанию (`false`, DEFAULT_MATERIALS_PAID_ACCESS в его
// собственном, ещё не удалённом коде) и при выключенном рубильнике считает
// `paid` равным `all` — то есть видит ровно то же самое, что миграция и
// записала. Откат старого кода на новую (уже смигрированную) базу тоже
// ничего не меняет: `access: 'all'` он трактует как обычно, а поля
// `materialsPaidAccess` в документе settings просто нет — тем же приёмом,
// что у легаси-документа, для которого этот код и был написан.
//
// Идемпотентна по построению: `$exists: true` и `access: 'paid'` не находят
// ничего на втором прогоне.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому тип `Db` совпадает
// с тем, что отдаёт `connection.db` — без второй копии пакета `mongodb`
// в дереве зависимостей.
type Db = mongo.Db;

const SETTINGS = 'settings';
const MATERIALS = 'materials';

// Сырая строка, не импорт из `@xuanxue/shared` (значения `MaterialAccess`
// больше нет там, как и у REMOVED_KIND_* в миграциях 0011/0012) — миграция
// хранит исторический факт о данных, а не ссылается на тип, который сама же
// делает недостижимым.
export const REMOVED_ACCESS_PAID = 'paid';

export const materialsWithoutPaidAccess = {
  id: '0014-materials-without-paid-access',
  async up(db: Db): Promise<void> {
    await db
      .collection(SETTINGS)
      .updateMany(
        { materialsPaidAccess: { $exists: true } },
        { $unset: { materialsPaidAccess: '' } },
      );
    await db
      .collection(MATERIALS)
      .updateMany({ access: REMOVED_ACCESS_PAID }, { $set: { access: 'all' } });
  },
};
