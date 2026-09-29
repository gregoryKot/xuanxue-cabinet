// Убирает слово «абонемент» из напоминания об оплате у школы, которая текст
// не правила (ADR-0157: бухгалтер не ведёт оплаты в кабинете, напоминание —
// просто напоминалка об ежемесячной оплате).
//
// Одной правки дефолта в коде мало: `paymentReminder.template` лежит в
// базе, только если учитель хоть раз сохранял экран «Шаблоны»; тогда в ней
// копия старого дефолта, и напоминание уходит с ней. Меняем ровно тот текст,
// который совпадает со старым дефолтом слово в слово; правленый учителем
// шаблон — его выбор, трогать нельзя. Нет поля — ничего не делаем: дефолт
// подставится на чтении (toSettingsDto).
//
// Старый и новый тексты лежат здесь константами, а не берутся из
// `shared/src/default-templates.ts`: иначе следующая правка дефолта
// незаметно переопределит смысл сравнения (тот же приём, что в 0005).
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')) — без второй копии пакета `mongodb`.
type Db = mongo.Db;

const SETTINGS = 'settings';
const TEMPLATE_PATH = 'paymentReminder.template';

const OLD_TEMPLATE =
  '{имя}, абонемент за {месяц} пока не отмечен оплаченным.\nЕсли вы уже перевели — пришлите скриншот сюда, и мы отметим.[ {ссылка}]';
const NEW_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nКогда переведёте — пришлите скриншот боту.[ {ссылка}]';

export const paymentReminderTemplateWithoutSubscription = {
  id: '0016-payment-reminder-template-without-subscription',
  async up(db: Db): Promise<void> {
    // Идемпотентность бесплатная: второй запуск не найдёт старый текст.
    await db
      .collection(SETTINGS)
      .updateMany(
        { [TEMPLATE_PATH]: OLD_TEMPLATE },
        { $set: { [TEMPLATE_PATH]: NEW_TEMPLATE, updatedAt: new Date() } },
      );
  },
};
