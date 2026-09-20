// Конфиг e2e-прогона: поднимает реальный AppModule на MongoMemoryServer
// (test/e2e-support/create-app.ts), а не мокает сервисы — правило CLAUDE.md
// «новый эндпоинт = DTO + e2e на владение». rootDir указывает на api/, как и
// в основном api/jest.config.js, хотя сам файл лежит в api/test/.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testRegex: '.*\\.e2e-spec\\.ts$',
  // test/jest.setup.ts ставит ENCRYPTION_KEY в process.env ДО того, как jest
  // впервые потребует любой src/** — иначе статический импорт из фикстуры
  // e2e-теста (например test/e2e-support/lessons-fixtures.ts), исполняющийся
  // раньше beforeAll()/setTestEnv() (create-app.ts), тянет utils/encryption.ts
  // с пустым ключом: loadKeys() кэширует его на верхнем уровне модуля один
  // раз на весь прогон, и всё «шифрование» в e2e молча превращается в
  // открытый текст (ловушка, найдена ревью). Повторный setTestEnv() внутри
  // createTestApp() безобиден — ключ просто перезаписывается тем же способом.
  setupFiles: ['reflect-metadata', '<rootDir>/test/jest.setup.ts'],
  // Тот же прогрев бинаря mongod, что в api/jest.config.js: e2e — третий
  // отдельный запуск jest, и на холодном кеше он ловил ту же гонку за замок.
  // Причина целиком — в шапке самого файла.
  globalSetup: '<rootDir>/test/jest.global-setup.ts',
  // Причина та же, что в api/jest.config.js, но лекарство строже: e2e-набор
  // поднимает в хуке не только mongod, но и целый AppModule, и параллельных
  // наборов память уже не держит — mongod не «не успевал стартовать», а падал
  // на ходу с «MongoServerError: interrupted at shutdown». Воспроизводится на
  // чистом main, то есть теснота тут давняя, а не от этих правок.
  //
  // Замеры e2e на 8 ядрах / 8 ГБ 2026-09-17:
  //   половина ядер, хук 60 000 мс   все наборы упали
  //   один воркер, хук 60 000 мс     303 с, 48 наборов и 301 тест зелёные
  //
  // Единицей, а не долей: параллельно e2e-наборы на 8 ГБ не живут вовсе.
  // И только вне CI — там раннер шире и на дефолтах зелёный, а
  // последовательный прогон растягивал джобу api (замер — в api/jest.config.js).
  // Лимит памяти рядом: один воркер проходит все наборы подряд без
  // перезапуска и копит в себе кеш ts-jest.
  ...(process.env.CI ? {} : { maxWorkers: 1, workerIdleMemoryLimit: '512MB' }),
  testTimeout: 60_000,
};
