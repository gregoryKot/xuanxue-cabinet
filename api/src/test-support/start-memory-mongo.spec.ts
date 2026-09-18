// Юнит на сам повтор — без настоящего mongod (CLAUDE.md «Тесты»: чистая
// логика — юнит без Mongo и без DI). MongoMemoryServer.create подменяется
// автомоком jest, чтобы управлять исходом каждой попытки: реальный подъём
// против настоящей базы проверяет channels.service.spec.ts (openMemoryMongo).
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startMemoryMongo } from './start-memory-mongo';

jest.mock('mongodb-memory-server');

// jest.spyOn(Класс, 'метод'), не `MongoMemoryServer.create` напрямую — иначе
// eslint (@typescript-eslint/unbound-method) ругается на ссылку на метод в
// отрыве от объекта (тот же приём, что в scheduler.service.spec.ts).
const createMock = jest.spyOn(MongoMemoryServer, 'create');

describe('startMemoryMongo', () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it('повторяет попытку при занятом порте и возвращает сервер со второй', async () => {
    const server = {} as unknown as MongoMemoryServer;
    createMock
      .mockRejectedValueOnce(new Error('Port "34699" already in use'))
      .mockResolvedValueOnce(server);

    await expect(startMemoryMongo()).resolves.toBe(server);
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('пробрасывает исходную ошибку, если порт занят на всех попытках', async () => {
    const error = new Error('Port "34699" already in use');
    createMock.mockRejectedValue(error);

    await expect(startMemoryMongo()).rejects.toBe(error);
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it('пробрасывает чужую ошибку сразу, без повтора', async () => {
    const error = new Error('Instance failed to start within 60000ms');
    createMock.mockRejectedValue(error);

    await expect(startMemoryMongo()).rejects.toBe(error);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
