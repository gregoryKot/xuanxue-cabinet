// jest.config в api — правило CLAUDE.md: `npm test` запускается из корня и из api.
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  preset: 'ts-jest',
  testRegex: '.*\\.spec\\.ts$',
  // class-validator/class-transformer декораторы (DTO, EnvSchema) читают
  // метаданные через reflect-metadata — в проде её грузит main.ts, в тестах
  // точки входа нет, поэтому полифилл ставится здесь один раз для всех спеков.
  setupFiles: ['reflect-metadata', '<rootDir>/test/jest.setup.ts'],
  // Из покрытия исключена только проводка без ветвлений: точка входа,
  // декларативные *.module.ts и app.setup.ts — их проверяет e2e на реальном
  // AppModule (test/), юнит-тест на них ничего не доказывает.
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/app.setup.ts',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: 'coverage',
};
