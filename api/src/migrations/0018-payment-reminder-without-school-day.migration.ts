// Общего дня напоминания об оплате у школы больше нет (ADR-0161, правка
// владельца: «нет такого дня школы»): день выбирает только ученик, а кто не
// выбрал, напоминания не получает. Поле `paymentReminder.dayOfMonth` в
// настройках школы осталось бы мёртвым значением, на которое однажды
// кто-нибудь снова начал бы опираться (CLAUDE.md «Отказались от механики —
// удаляем с концами»).
//
// Contract-шаг безопасен в одном PR с удалением кода: старый инстанс во время
// деплоя читает день через маппер с дефолтом (`doc?.dayOfMonth ?? 5`), так что
// пропавшее поле он переживает. Откат тоже: дефолт подставится сам.
//
// Идемпотентна по построению: фильтр `$exists`, второй запуск ничего не найдёт.
import type { mongo } from 'mongoose';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')) — без второй копии пакета `mongodb`.
type Db = mongo.Db;

const SETTINGS = 'settings';
const DAY_PATH = 'paymentReminder.dayOfMonth';

export const paymentReminderWithoutSchoolDay = {
  id: '0018-payment-reminder-without-school-day',
  async up(db: Db): Promise<void> {
    await db
      .collection(SETTINGS)
      .updateMany({ [DAY_PATH]: { $exists: true } }, { $unset: { [DAY_PATH]: '' } });
  },
};
