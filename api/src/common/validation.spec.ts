import { plainToInstance } from 'class-transformer';
import { IsString, validate } from 'class-validator';
import { ListLimit, OptionalNotNull, TrimString } from './validation';

class OptionalNotNullFixture {
  @OptionalNotNull()
  @IsString()
  field?: string | null;
}

class TrimStringFixture {
  @TrimString()
  @IsString()
  title!: string;
}

class ListLimitFixture {
  @ListLimit()
  limit?: number;
}

class ListLimitCustomMaxFixture {
  @ListLimit(10)
  limit?: number;
}

describe('OptionalNotNull', () => {
  it('undefined — валидация пропущена, ошибок нет', async () => {
    const errors = await validate(Object.assign(new OptionalNotNullFixture(), {}));
    expect(errors).toHaveLength(0);
  });

  it('null — доходит до @IsString() и падает', async () => {
    const errors = await validate(
      Object.assign(new OptionalNotNullFixture(), { field: null }),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraints).toHaveProperty('isString');
  });

  it('строка — проходит без ошибок', async () => {
    const errors = await validate(
      Object.assign(new OptionalNotNullFixture(), { field: 'x' }),
    );
    expect(errors).toHaveLength(0);
  });
});

describe('TrimString', () => {
  it('обрезает пробелы по краям', () => {
    const instance = plainToInstance(TrimStringFixture, { title: '  Тайцзицюань  ' });
    expect(instance.title).toBe('Тайцзицюань');
  });

  it('пробелы без содержимого — пустая строка', () => {
    const instance = plainToInstance(TrimStringFixture, { title: '   ' });
    expect(instance.title).toBe('');
  });

  it('не строку — не трогает, дальше решает @IsString()', () => {
    const instance = plainToInstance(TrimStringFixture, { title: 42 });
    expect(instance.title).toBe(42);
  });
});

describe('ListLimit', () => {
  it('не задан — валиден, сервис подставит дефолт', async () => {
    const errors = await validate(plainToInstance(ListLimitFixture, {}));
    expect(errors).toHaveLength(0);
  });

  it('валидное число из query-строки — приводится к number', async () => {
    const instance = plainToInstance(ListLimitFixture, { limit: '50' });
    expect(instance.limit).toBe(50);
    expect(await validate(instance)).toHaveLength(0);
  });

  it('0 — падает: меньше минимума', async () => {
    const errors = await validate(plainToInstance(ListLimitFixture, { limit: '0' }));
    expect(errors).not.toHaveLength(0);
  });

  it('не число — падает', async () => {
    const errors = await validate(plainToInstance(ListLimitFixture, { limit: 'много' }));
    expect(errors).not.toHaveLength(0);
  });

  it('свой потолок max: в границах — валиден, выше — падает', async () => {
    const inBound = await validate(
      plainToInstance(ListLimitCustomMaxFixture, { limit: '10' }),
    );
    expect(inBound).toHaveLength(0);

    const overBound = await validate(
      plainToInstance(ListLimitCustomMaxFixture, { limit: '11' }),
    );
    expect(overBound).not.toHaveLength(0);
  });
});
