// Против настоящей Mongo (mongodb-memory-server, CLAUDE.md «Тесты»): личная
// настройка плиток «Главной» (ADR-0179). Read-after-write — через
// UsersService.findById + toMeDto, как видит человека AuthGuard, а не только по
// возврату setHidden. Образец — user-student-mode.service.spec.ts.
import type { Model } from 'mongoose';
import { toMeDto } from '../auth/user.mapper';
import { UserRecord, UserSchema } from './user.schema';
import { UserHomeTilesService } from './user-home-tiles.service';
import { UsersService, type UserLean } from './users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

describe('UserHomeTilesService.setHidden', () => {
  let memory: MemoryMongo;
  let model: Model<UserRecord>;
  let service: UserHomeTilesService;
  let users: UsersService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    model = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    service = new UserHomeTilesService(model);
    users = new UsersService(model);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  async function person(): Promise<string> {
    const doc = await model.create({ name: 'Ученик', roles: [], status: 'active' });
    return doc._id.toString();
  }

  /** Человек так, как его читает AuthGuard (UsersService.findById). */
  async function readLean(id: string): Promise<UserLean> {
    const lean = await users.findById(id);
    if (!lean) throw new Error('человек не найден');
    return lean;
  }

  async function rawField(id: string): Promise<unknown> {
    const doc = await model.findById(id).lean();
    return doc?.homeHiddenTiles;
  }

  it('у нового человека поля нет и MeDto отдаёт пустой список', async () => {
    const id = await person();

    expect(await rawField(id)).toBeUndefined();
    expect(toMeDto(await readLean(id), false).homeHiddenTiles).toEqual([]);
  });

  it('записал → AuthGuard-чтение и toMeDto отдают то же (read-after-write)', async () => {
    const id = await person();

    const returned = await service.setHidden(id, ['payment', 'exams']);

    expect(toMeDto(returned, false).homeHiddenTiles).toEqual(['exams', 'payment']);
    const reread = await readLean(id);
    expect(toMeDto(reread, false).homeHiddenTiles).toEqual(['exams', 'payment']);
  });

  it('дубли схлопываются, в базе канонический порядок', async () => {
    const id = await person();

    await service.setHidden(id, ['events', 'payment', 'events']);

    expect(await rawField(id)).toEqual(['payment', 'events']);
  });

  it('второй список заменяет первый целиком, а не дополняет', async () => {
    const id = await person();
    await service.setHidden(id, ['payment', 'events']);

    await service.setHidden(id, ['exams']);

    expect(await rawField(id)).toEqual(['exams']);
  });

  it('пустой список снимает скрытие: поля в базе нет', async () => {
    const id = await person();
    await service.setHidden(id, ['payment']);

    const returned = await service.setHidden(id, []);

    expect(await rawField(id)).toBeUndefined();
    expect(toMeDto(returned, false).homeHiddenTiles).toEqual([]);
  });

  it('другого человека не трогает', async () => {
    const mine = await person();
    const other = await person();

    await service.setHidden(mine, ['payment']);

    expect(await rawField(other)).toBeUndefined();
  });

  it('невалидный и несуществующий id — NotFoundError, не падение', async () => {
    await expect(service.setHidden('не-objectid', [])).rejects.toThrow(
      'Пользователь не найден',
    );
    await expect(service.setHidden('507f1f77bcf86cd799439011', [])).rejects.toThrow(
      'Пользователь не найден',
    );
  });
});
