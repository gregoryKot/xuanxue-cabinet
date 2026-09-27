// Юнит на class-validator/class-transformer — без Nest и без Mongo
// (CLAUDE.md «Тесты»). Образец приёма — ListLimit в common/validation.spec.ts.
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { APP_ERROR_LIMITS } from '@xuanxue/shared';
import { ListAppErrorsQueryDto } from './list-app-errors.dto';

describe('ListAppErrorsQueryDto', () => {
  it('пустой query — валиден', async () => {
    const errors = await validate(plainToInstance(ListAppErrorsQueryDto, {}));
    expect(errors).toHaveLength(0);
  });

  it('limit не задан — валиден, сервис подставит дефолт', () => {
    const instance = plainToInstance(ListAppErrorsQueryDto, {});
    expect(instance.limit).toBeUndefined();
  });

  it('limit строкой из query — приводится к number', async () => {
    const instance = plainToInstance(ListAppErrorsQueryDto, { limit: '50' });
    expect(instance.limit).toBe(50);
    expect(await validate(instance)).toHaveLength(0);
  });

  it('limit больше APP_ERROR_LIMITS.maxLimit (201) — падает', async () => {
    const errors = await validate(
      plainToInstance(ListAppErrorsQueryDto, {
        limit: String(APP_ERROR_LIMITS.maxLimit + 1),
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('чужой source — падает', async () => {
    const errors = await validate(
      plainToInstance(ListAppErrorsQueryDto, { source: 'sms' }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('чужой kind — падает', async () => {
    const errors = await validate(
      plainToInstance(ListAppErrorsQueryDto, { kind: 'panic' }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('requestId длиннее APP_ERROR_LIMITS.requestId — падает', async () => {
    const errors = await validate(
      plainToInstance(ListAppErrorsQueryDto, {
        requestId: 'x'.repeat(APP_ERROR_LIMITS.requestId + 1),
      }),
    );
    expect(errors).not.toHaveLength(0);
  });

  it('requestId в границах — валиден', async () => {
    const errors = await validate(
      plainToInstance(ListAppErrorsQueryDto, {
        requestId: 'x'.repeat(APP_ERROR_LIMITS.requestId),
      }),
    );
    expect(errors).toHaveLength(0);
  });
});
