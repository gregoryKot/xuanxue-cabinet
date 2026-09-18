// Общий подъём MongoMemoryServer с ограниченным повтором при занятом порте.
//
// Инцидент 2026-09-18 (PR #218, джоба api,
// https://github.com/gregoryKot/xuanxue-cabinet/actions/runs/35380358482):
// beforeAll в channels.service.spec.ts упал на старте mongod — два
// параллельных воркера jest выбрали один и тот же свободный порт, и все 21
// теста сьюта посыпались «Cannot read properties of undefined» на модели,
// которую beforeAll не успел присвоить, хотя к их собственной логике падение
// отношения не имело. mongodb-memory-server 11.2 занятый порт сам не
// переигрывает — при конфликте он только эмитит `StdoutInstanceError` с
// текстом `Port "<port>" already in use` (см.
// node_modules/mongodb-memory-server-core/lib/util/MongoInstance.js, ~385) и
// падает. Похожие срывы старта mongod уже ловились 2026-09-10, 2026-09-11 и
// 2026-09-17 — это повторяемый класс сбоя, не разовая случайность, поэтому
// чиним сам подъём базы, а не прячем падение ретраем на уровне теста
// (CLAUDE.md «Детерминизм»: retry на тесте запрещён).
//
// Повторяем только конфликт порта: библиотека выбирает новый порт при каждом
// create(), и гонка рассасывается уже на первой пересдаче — ждать между
// попытками нечего. Любая другая причина (бинарь не скачался, mongod не
// стартовал за launchTimeout) — настоящий сбой, а не гонка за порт: она
// пробрасывается сразу, без повторов, иначе три круга по launchTimeout
// растянули бы и без того красный прогон впятеро.
//
// Файл обязан оставаться лёгким: его читает api/test/e2e-support/create-app.ts
// ДО того, как выставит process.env (см. шапку mongo-memory-options.ts) —
// импортировать сюда реестр моделей или шифрование нельзя.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MONGO_MEMORY_INSTANCE_OPTIONS } from './mongo-memory-options';

// Первая попытка — обычный старт, ещё две — пересдача при гонке за порт.
const MAX_ATTEMPTS = 3;

// Текст ошибки библиотеки при занятом порте — `Port "34699" already in use`
// (MongoInstance.js). Формулировка `address already in use` (сырой EADDRINUSE
// самой ОС, на случай если библиотека когда-нибудь пробросит его как есть)
// содержит ту же подстроку — отдельная проверка не нужна.
function isPortInUseError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already in use/i.test(message);
}

function createServer(): Promise<MongoMemoryServer> {
  return MongoMemoryServer.create({ instance: MONGO_MEMORY_INSTANCE_OPTIONS });
}

/** Поднимает MongoMemoryServer; порт для mongod библиотека каждый раз
 * выбирает сама. При ошибке занятого порта повторяет попытку — до
 * MAX_ATTEMPTS всего, без пауз между ними. Любая другая ошибка, и ошибка
 * последней попытки — пробрасываются как есть, без обёртки: в логе CI важен
 * исходный текст библиотеки. */
export async function startMemoryMongo(): Promise<MongoMemoryServer> {
  for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await createServer();
    } catch (err) {
      if (!isPortInUseError(err)) throw err;
    }
  }
  // Последняя попытка — без try/catch: если тоже упадёт на занятом порте,
  // ошибка библиотеки уходит наверх как есть.
  return createServer();
}
