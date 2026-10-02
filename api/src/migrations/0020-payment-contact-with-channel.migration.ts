// Переносит способ связи («в Telegram») из кода в сам контакт для оплаты
// (ADR-0159, правка владельца: «а если в других местах контакты нужно добавить?»).
// Фраза в «Профиле» и в напоминании стала «Отправьте скриншот об оплате
// {контакт}.», без «в Telegram» в коде: так в поле можно вписать WhatsApp или
// телефон, и фраза не сломается.
//
// Одной правки дефолтов в коде мало: у школы, которая хоть раз сохраняла экран
// «Шаблоны», в базе лежит копия прежнего дефолта. Меняем ровно то, что совпадает
// с прежним значением слово в слово: шаблон напоминания (дефолт из 0017) и
// контакт «Маше @marievyazova». Свой текст учителя — его выбор, трогать нельзя.
// Нет поля — ничего не делаем: дефолт подставится на чтении (toSettingsDto).
//
// Прежние и новые значения лежат здесь константами, а не берутся из `shared`:
// иначе следующая правка дефолта незаметно переопределит смысл сравнения (тот
// же приём, что в 0005, 0016 и 0017).
//
// Совместимость со старым кодом на время деплоя: старый инстанс подставит
// новый контакт в фразу «…присылайте {контакт} в Telegram» — «в Telegram» в ней
// прозвучит дважды, но фраза остаётся читаемой, а деплой длится минуты.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')) — без второй копии пакета `mongodb`.
type Db = mongo.Db;

const SETTINGS = 'settings';
const TEMPLATE_PATH = 'paymentReminder.template';
const CONTACT_PATH = 'paymentContact';

const PREVIOUS_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nСкриншот перевода пришлите {контакт} в Telegram.';
const NEW_TEMPLATE =
  '{имя}, напоминаем об оплате за {месяц}.\nСкриншот об оплате отправьте {контакт}.';

const PREVIOUS_CONTACT = 'Маше @marievyazova';
const NEW_CONTACT = 'Маше Вязовой — например, в Telegram @marievyazova';

export const paymentContactWithChannel = {
  id: '0020-payment-contact-with-channel',
  async up(db: Db): Promise<void> {
    const settings = db.collection(SETTINGS);
    const now = new Date();
    // Идемпотентность бесплатная: второй запуск не найдёт прежних значений.
    await settings.updateMany(
      { [TEMPLATE_PATH]: PREVIOUS_TEMPLATE },
      { $set: { [TEMPLATE_PATH]: NEW_TEMPLATE, updatedAt: now } },
    );
    await settings.updateMany(
      { [CONTACT_PATH]: PREVIOUS_CONTACT },
      { $set: { [CONTACT_PATH]: NEW_CONTACT, updatedAt: now } },
    );
  },
};
