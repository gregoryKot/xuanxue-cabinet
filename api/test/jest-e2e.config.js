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
};
