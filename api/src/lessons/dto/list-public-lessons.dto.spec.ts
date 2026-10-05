// Юнит на class-validator/class-transformer — без Nest и без Mongo
// (CLAUDE.md «Тесты»), образец google-login.dto.spec.ts. DTO проверяет только
// формат полей; «либо limit, либо from+to» и ширину окна держит
// `resolvePublicLessonsWindow` (public-lessons-window.spec.ts).
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPublicLessonsDto } from './list-public-lessons.dto';

describe('ListPublicLessonsDto', () => {
  it('пустой query валиден', async () => {
    const errors = await validate(plainToInstance(ListPublicLessonsDto, {}));
    expect(errors).toHaveLength(0);
  });

  it("limit '10' из строки запроса валиден и становится числом 10", async () => {
    const dto = plainToInstance(ListPublicLessonsDto, { limit: '10' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(10);
  });

  it.each(['0', '51', 'abc', '1.5'])('limit %j — ошибка', async (limit) => {
    const errors = await validate(plainToInstance(ListPublicLessonsDto, { limit }));
    expect(errors.map((e) => e.property)).toEqual(['limit']);
  });

  it('from в ISO 8601 с Z валиден', async () => {
    const errors = await validate(
      plainToInstance(ListPublicLessonsDto, { from: '2026-10-05T00:00:00Z' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('from и to не в формате ISO 8601 — ошибка по каждому полю', async () => {
    const errors = await validate(
      plainToInstance(ListPublicLessonsDto, { from: 'мусор', to: 'тоже мусор' }),
    );
    expect(errors.map((e) => e.property).sort()).toEqual(['from', 'to']);
  });

  // Фиксируем как есть: дата без времени для IsISO8601({ strict: true })
  // допустима. Требование смещения («19:00» не должно молча стать UTC)
  // проверяет `parseUtcIso` в сервисе, а не DTO.
  it('from без времени и смещения проходит DTO: смещение требует parseUtcIso', async () => {
    const errors = await validate(
      plainToInstance(ListPublicLessonsDto, { from: '2026-10-05' }),
    );
    expect(errors).toHaveLength(0);
  });
});
