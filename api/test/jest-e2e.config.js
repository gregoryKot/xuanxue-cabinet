// Конфиг e2e-прогона: поднимает реальный AppModule на MongoMemoryServer
// (test/e2e-support/create-app.ts), а не мокает сервисы — правило CLAUDE.md
// «новый эндпоинт = DTO + e2e на владение». rootDir указывает на api/, как и
// в основном api/jest.config.js, хотя сам файл лежит в api/test/.
module.exports = {
  rootDir: '..',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testRegex: '.*\\.e2e-spec\\.ts$',
  setupFiles: ['reflect-metadata'],
};
