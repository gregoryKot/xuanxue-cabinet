// Бинарь mongod выдаётся один раз здесь, в родительском процессе jest, а не в
// каждом воркере по отдельности.
//
// Инцидент 2026-09-20 (PR #262, джоба api, прогоны на c51b981 и fb3cafe):
// воркеры стартовали одновременно, все разом заходили в MongoBinary.getPath()
// и дрались за ~/.cache/mongodb-binaries/<версия>.lock. Кто успел — прошёл,
// остальные падали ещё до тела теста, в beforeAll: «ENOENT … rename
// '…/8.2.6.tgz.downloading' -> '…/8.2.6.tgz'» и «Cannot unlock file
// "…/8.2.6.lock", because it is not locked by this process». Дальше сыпались
// все спеки с памятью-Mongo — сначала «Exceeded timeout … for a hook», затем
// «Cannot read properties of undefined» на модели, которую beforeAll не успел
// присвоить. Набор падающих файлов был каждый раз новый и выглядел регрессией
// свежих правок, хотя дифф PR был ни при чём. Тот же класс сбоя, что в шапках
// api/jest.config.js и src/test-support/start-memory-mongo.ts; чинится причина
// (гонка за скачивание), а не симптом: retry на тесте запрещён (CLAUDE.md
// «Детерминизм»).
//
// Почему кеш бинаря на CI холодный, хотя postinstall библиотеки его качает
// при `npm ci`. Каталог кеша mongodb-memory-server ищет от INIT_CWD, а его
// каждый раз переписывает тот, кто запускает: у postinstall это корень
// монорепо (бинарь ложится в <корень>/node_modules/.cache), а
// scripts/check-coverage-ratchet.mjs зовёт `npx jest` с cwd=api/ — и npx
// ставит INIT_CWD=api/, так что библиотека смотрит в api/node_modules/.cache,
// не находит и качает заново, уже в ~/.cache/mongodb-binaries. Отсюда и
// «через раз»: падал только шаг с храповиком покрытия, а соседние два запуска
// jest идут через `npm --workspace=api` (INIT_CWD — корень) и берут готовый
// бинарь. Ограничение воркеров не помогло бы: на CI его нет намеренно (замер
// в api/jest.config.js), да и любая параллельность воспроизводит гонку.
//
// getPath() без опций — намеренно: MongoInstance.start() зовёт
// MongoBinary.getPath(binaryOpts), а тесты создают сервер без секции `binary`
// (src/test-support/start-memory-mongo.ts), то есть с теми же пустыми
// опциями. Версия и каталог разрешаются одинаково, и воркеры находят готовый
// бинарь. Появится своя `binary` в опциях сервера — те же опции нужны и
// здесь, иначе прогрев греет не то.
import { MongoBinary } from 'mongodb-memory-server';

export default async function globalSetup(): Promise<void> {
  await MongoBinary.getPath();
}
