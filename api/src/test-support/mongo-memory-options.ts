// Опции экземпляра mongod для тестов — отдельный файл без импортов, потому что
// его читает и test/e2e-support/create-app.ts ДО того, как выставит process.env
// (импорт mongo-memory.ts тянул бы реестр моделей и шифрование, а то читает
// ENCRYPTION_KEY при загрузке модуля).
//
// launchTimeout: по умолчанию библиотека ждёт старта mongod 10 секунд, и на
// загруженной машине (полный `npm run check`: рядом сборка web и vitest, или
// несколько ворктри с jest одновременно) холодный старт в это не укладывается
// — спек падает с «Instance failed to start within 10000ms», хотя код ни при
// чём (ловилось 2026-09-10, 2026-09-11, 2026-09-17). Порог — не про скорость,
// а про то, что mongod вообще поднимется. Только опцией `instance.launchTimeout`:
// переменной окружения для этого у mongodb-memory-server нет — прежняя строка
// `MONGOMS_STARTUP_TIMEOUT` в jest.setup.ts ничего не делала.
export const MONGO_MEMORY_INSTANCE_OPTIONS = { launchTimeout: 60_000 } as const;
