// Стартовое расписание школы (PLAN.md §9) заезжает в базу миграцией, а не
// импортом файла: CLI `seed:classes` требует прод-секретов на машине того,
// кто его запускает, а миграция едет вместе с деплоем и применяется на
// Railway сама, где MONGODB_URI и ENCRYPTION_KEY уже лежат.
//
// Ссылок Zoom и пароля здесь нет и не будет: настоящие ссылки в репозиторий
// не кладутся (SECURITY.md, гейт gitleaks), а ссылка — та самая настройка,
// которую учитель меняет сам на экране «Занятия» (CLAUDE.md «всё
// настраивается в интерфейсе»). Миграция создаёт слоты с названиями и
// временем; ссылку и пароль вписывает учитель.
//
// Пишем сырыми документами через драйвер, а не моделью Mongoose: у миграции
// на входе `Db`, и это правильно — миграция должна пережить будущую правку
// схемы, а не тянуть за собой её сегодняшнюю версию. Поэтому все поля,
// которые схема проставила бы по умолчанию (tz, channelIds, leadMinutes,
// active, timestamps, `_id` у правила), выписаны здесь явно.
import { mongo } from 'mongoose';
import { DEFAULT_LEAD_MINUTES, SCHOOL_TZ, type Weekday } from '@xuanxue/shared';

// `mongo` — реэкспорт того же драйвера, что использует mongoose внутри
// (mongoose.mongo === require('mongodb')), поэтому и `Db`, и `ObjectId`
// совпадают с тем, что использует сам mongoose — без второй копии пакета
// `mongodb` в дереве зависимостей.
const { ObjectId } = mongo;
type Db = mongo.Db;

const COLLECTION = 'classes';

// Дни недели как в схеме: 0 — воскресенье, 6 — суббота.
const [SUN, MON, TUE, WED, THU, FRI, SAT] = [0, 1, 2, 3, 4, 5, 6] as const;
const HOUR = 60;

interface SeedRule {
  weekday: Weekday;
  time: string;
  durationMin: number;
}

interface SeedClass {
  title: string;
  // Подпись группы — часть ключа (title, groupLabel) и первая строка поста.
  // У двух занятий она стоит только затем, чтобы отличить слот от тёзки с
  // другой ссылкой Zoom: «Медитация чжи-гуань (четверг)» и «Тайцзицюань
  // (среда)». Сверить с Димой (PLAN.md §9) — переименование безопасно, это
  // обычная правка на экране «Занятия».
  groupLabel: string;
  rules: SeedRule[];
}

const at = (weekday: Weekday, time: string, durationMin = HOUR): SeedRule => ({
  weekday,
  time,
  durationMin,
});

// Ровно таблица из PLAN.md §9: 11 слотов, 16 занятий в неделю. Слот — это
// одна ссылка Zoom, поэтому «Утреннее занятие» с общей ссылкой на Пн/Вт/Чт —
// один слот с тремя правилами, а не три слота.
const SCHOOL_CLASSES: SeedClass[] = [
  {
    title: 'Медитация чжи-гуань',
    groupLabel: '',
    rules: [at(SUN, '08:00'), at(WED, '08:00')],
  },
  { title: 'Медитация чжи-гуань', groupLabel: 'четверг', rules: [at(THU, '10:00')] },
  { title: 'Цигун для глаз', groupLabel: '', rules: [at(SUN, '10:00')] },
  {
    title: 'Утреннее занятие школы Сюань-Сюэ',
    groupLabel: '',
    rules: [at(MON, '08:00'), at(TUE, '08:00'), at(THU, '08:00')],
  },
  {
    title: 'Цзибеньгун',
    groupLabel: 'средняя группа',
    rules: [at(MON, '10:00'), at(TUE, '10:00')],
  },
  { title: 'Тайцзицюань', groupLabel: '', rules: [at(MON, '18:30')] },
  { title: 'Тайцзицюань', groupLabel: 'среда', rules: [at(WED, '10:00')] },
  { title: 'Ицзиньцзин и Бадуаньцзинь', groupLabel: '', rules: [at(TUE, '18:30')] },
  {
    title: 'Цзибеньгун',
    groupLabel: '',
    rules: [at(WED, '18:30'), at(FRI, '18:30')],
  },
  { title: 'Основы Дхармы', groupLabel: '', rules: [at(FRI, '12:00', 90)] },
  { title: 'Медитация для начинающих', groupLabel: '', rules: [at(SAT, '18:00', 120)] },
];

/** Создаёт слоты, которых ещё нет, по тому же ключу `(title, groupLabel)`,
 * что и импорт из файла (PLAN.md §9): раннер и так применяет миграцию один
 * раз, но миграция обязана быть идемпотентной сама по себе — база могла уже
 * получить эти занятия руками или импортом до деплоя. */
export const seedSchoolClasses = {
  id: '0001-school-classes',
  async up(db: Db): Promise<void> {
    const collection = db.collection(COLLECTION);
    const now = new Date();

    for (const seed of SCHOOL_CLASSES) {
      const exists = await collection.findOne(
        { title: seed.title, groupLabel: seed.groupLabel },
        { projection: { _id: 1 } },
      );
      if (exists) continue;

      await collection.insertOne({
        title: seed.title,
        groupLabel: seed.groupLabel,
        format: 'online',
        // Правило расписания — субдокумент с собственным `_id`: планировщик
        // ссылается на него из `lessons.ruleId` (class.schema.ts).
        rules: seed.rules.map((rule) => ({ _id: new ObjectId(), ...rule })),
        tz: SCHOOL_TZ,
        channelIds: [],
        leadMinutes: DEFAULT_LEAD_MINUTES,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
};
