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

// Лимит ожидания старта mongod задаётся не здесь и не через env (у
// mongodb-memory-server нет такой переменной — строка MONGOMS_STARTUP_TIMEOUT,
// жившая тут до 2026-09-17, ничего не делала), а опцией instance.launchTimeout
// в src/test-support/mongo-memory-options.ts, общей для юнит-спеков и e2e.
