import { validateEnv } from './env.validation';

const VALID_PROD: Record<string, unknown> = {
  NODE_ENV: 'production',
  PORT: '3000',
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/xuanxue',
  ENCRYPTION_KEY: 'a1'.repeat(32),
  JWT_SECRET: 'x'.repeat(32),
  PUBLIC_URL: 'https://cabinet.xuanxue.example',
  LOG_LEVEL: 'info',
};

describe('validateEnv', () => {
  it('валидный production-набор проходит без ошибок', () => {
    const env = validateEnv(VALID_PROD);
    expect(env.NODE_ENV).toBe('production');
    expect(env.PORT).toBe(3000);
  });

  it('падает, если MONGODB_URI отсутствует', () => {
    const { MONGODB_URI: _drop, ...rest } = VALID_PROD;
    expect(() => validateEnv(rest)).toThrow(/MONGODB_URI/);
  });

  it('падает, если MONGODB_URI не начинается с mongodb(+srv)://', () => {
    expect(() => validateEnv({ ...VALID_PROD, MONGODB_URI: 'postgres://x' })).toThrow(
      /MONGODB_URI/,
    );
  });

  it('production без JWT_SECRET падает', () => {
    const { JWT_SECRET: _drop, ...rest } = VALID_PROD;
    expect(() => validateEnv(rest)).toThrow(/JWT_SECRET/);
  });

  it('production без ENCRYPTION_KEY падает', () => {
    const { ENCRYPTION_KEY: _drop, ...rest } = VALID_PROD;
    expect(() => validateEnv(rest)).toThrow(/ENCRYPTION_KEY/);
  });

  it('production без PUBLIC_URL падает', () => {
    const { PUBLIC_URL: _drop, ...rest } = VALID_PROD;
    expect(() => validateEnv(rest)).toThrow(/PUBLIC_URL/);
  });

  it('PUBLIC_URL с завершающим слэшем падает', () => {
    expect(() =>
      validateEnv({ ...VALID_PROD, PUBLIC_URL: 'https://cabinet.xuanxue.example/' }),
    ).toThrow(/PUBLIC_URL/);
  });

  it('кривой ENCRYPTION_KEY (не 64 hex) падает', () => {
    expect(() => validateEnv({ ...VALID_PROD, ENCRYPTION_KEY: 'not-hex' })).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it('кривой ENCRYPTION_KEY_OLD падает', () => {
    expect(() =>
      validateEnv({ ...VALID_PROD, ENCRYPTION_KEY_OLD: 'zz'.repeat(32) }),
    ).toThrow(/ENCRYPTION_KEY_OLD/);
  });

  it('валидный ENCRYPTION_KEY_OLD со списком через запятую проходит', () => {
    const env = validateEnv({
      ...VALID_PROD,
      ENCRYPTION_KEY_OLD: `${'b2'.repeat(32)}, ${'c3'.repeat(32)}`,
    });
    expect(env.ENCRYPTION_KEY_OLD).toContain(',');
  });

  it('кривой BOT_TOKEN падает, отсутствующий — нет', () => {
    expect(() => validateEnv({ ...VALID_PROD, BOT_TOKEN: 'not-a-token' })).toThrow(
      /BOT_TOKEN/,
    );
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('кривой TELEGRAM_WEBHOOK_SECRET падает, отсутствующий — нет', () => {
    expect(() =>
      validateEnv({ ...VALID_PROD, TELEGRAM_WEBHOOK_SECRET: 'секрет с пробелом' }),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('валидный TELEGRAM_WEBHOOK_SECRET проходит, production не требует его', () => {
    const env = validateEnv({ ...VALID_PROD, TELEGRAM_WEBHOOK_SECRET: 'a1B2_c3-D4' });
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBe('a1B2_c3-D4');
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('development без секретов проходит с дефолтами', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/xuanxue' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.ENCRYPTION_KEY).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.PUBLIC_URL).toBeUndefined();
    expect(env.SCHEDULER_ENABLED).toBe('true');
  });

  it('SCHEDULER_ENABLED=false проходит строкой, не превращается в true', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      SCHEDULER_ENABLED: 'false',
    });
    expect(env.SCHEDULER_ENABLED).toBe('false');
  });

  it('SCHEDULER_ENABLED вне true/false падает, пустая строка — дефолт', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        SCHEDULER_ENABLED: 'yes',
      }),
    ).toThrow(/SCHEDULER_ENABLED/);

    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      SCHEDULER_ENABLED: '',
    });
    expect(env.SCHEDULER_ENABLED).toBe('true');
  });

  it('вне production заданный, но кривой ENCRYPTION_KEY всё равно падает', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        ENCRYPTION_KEY: 'короткий',
      }),
    ).toThrow(/ENCRYPTION_KEY/);
  });

  it('пустая строка в env трактуется как отсутствие переменной', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      PORT: '',
      ENCRYPTION_KEY: '',
    });
    expect(env.PORT).toBe(3000);
    expect(env.ENCRYPTION_KEY).toBeUndefined();
  });

  it('невалидный NODE_ENV падает', () => {
    expect(() =>
      validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x', NODE_ENV: 'staging' }),
    ).toThrow(/NODE_ENV/);
  });

  it('невалидный PORT падает', () => {
    expect(() =>
      validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x', PORT: '999999' }),
    ).toThrow(/PORT/);
  });

  it('BOOTSTRAP_ADMIN_TELEGRAM_ID: валидное число проходит и приводится к number', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      BOOTSTRAP_ADMIN_TELEGRAM_ID: '123456789',
    });
    expect(env.BOOTSTRAP_ADMIN_TELEGRAM_ID).toBe(123456789);
  });

  it('BOOTSTRAP_ADMIN_TELEGRAM_ID: пустая строка — отсутствует, не 0', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      BOOTSTRAP_ADMIN_TELEGRAM_ID: '',
    });
    expect(env.BOOTSTRAP_ADMIN_TELEGRAM_ID).toBeUndefined();
  });

  it('BOOTSTRAP_ADMIN_TELEGRAM_ID: не заданное — отсутствует', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x' });
    expect(env.BOOTSTRAP_ADMIN_TELEGRAM_ID).toBeUndefined();
  });

  it('BOOTSTRAP_ADMIN_TELEGRAM_ID: не число или не положительное — падает', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        BOOTSTRAP_ADMIN_TELEGRAM_ID: 'не-число',
      }),
    ).toThrow(/BOOTSTRAP_ADMIN_TELEGRAM_ID/);

    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        BOOTSTRAP_ADMIN_TELEGRAM_ID: '0',
      }),
    ).toThrow(/BOOTSTRAP_ADMIN_TELEGRAM_ID/);
  });
});
