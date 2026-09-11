// Глушит встроенный логгер Nest в юнит-тестах: иначе каждый прогон jest
// засыпан «Применяю миграцию …» и предупреждениями шифрования, и реальная
// ошибка тонет в шуме. На поведение кода не влияет — Logger остаётся
// подключён, просто ничего не печатает.
import { randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

Logger.overrideLogger(false);

// utils/encryption.ts читает ENCRYPTION_KEY один раз при импорте модуля
// (loadKeys() на верхнем уровне файла) — юнит-спекам, которые гоняют
// encryptRecord/decryptRecord по-настоящему (classes.service.spec.ts и
// подобные against openMemoryMongo), нужен ключ в process.env ДО того, как
// jest впервые потребует src/**, который тянет encryption.ts по цепочке
// импортов. ??=, не =: encryption.spec.ts сам управляет env через
// jest.resetModules()/loadWithEnv() и не должен получить здесь чужой ключ.
process.env.ENCRYPTION_KEY ??= randomBytes(32).toString('hex');

// mongodb-memory-server по умолчанию ждёт старта mongod 10 секунд. На загруженной
// машине (полный `npm run check`: рядом идут сборка web и vitest) холодный старт
// в это не укладывается, и спек падает с «Instance failed to start within 10000ms»
// — тест мигает, хотя код ни при чём (ловилось дважды 2026-09-10 и 2026-09-11).
// Порог — не про скорость, а про то, что mongod вообще поднимется.
process.env.MONGOMS_STARTUP_TIMEOUT ??= '60000';
