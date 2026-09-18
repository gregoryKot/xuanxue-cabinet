// Драйвер `mongodb` с версии 7.6.0 резолвит `os`-адаптер асинхронным
// `await import('os')` внутри синхронного разбора опций подключения
// (mongodb/lib/runtime_adapters.js) и намеренно не ждёт этот промис сам —
// ждать должен первый потребитель (сборка client-метадаты хендшейка).
// Под Jest (все *.spec.ts на mongodb-memory-server и e2e) динамический
// `import()` встроенного модуля падает, ошибка глушится (`squashError`),
// и в client-метадате хендшейка пропадает обязательный саб-документ
// `driver` — mongod отвечает `MongoServerSelectionError: Missing required
// sub-document 'driver'…» и вообще не подключается (Automattic/mongoose#16499,
// typegoose/mongodb-memory-server#1026). Вне Jest (прод, `npm run start`)
// динамический импорт `os` отрабатывает и без этого — воспроизведено вручную.
//
// `runtimeAdapters.os` — публичная (экспериментальная) опция самого
// драйвера ровно для этого случая: если синхронный `os` передан явно,
// драйвер не трогает `import()` вовсе. Передаём везде, где открываем
// подключение к Mongo (api/src/app.module.ts, test-support/mongo-memory.ts),
// а не патчим сам пакет — обходим баг официальной опцией, а не подгонкой
// внутренностей чужого модуля.
import * as os from 'os';
import type { mongo } from 'mongoose';

export const MONGO_RUNTIME_ADAPTERS: mongo.MongoClientOptions['runtimeAdapters'] = {
  os,
};
