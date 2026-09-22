// Прогон валидации окружения (env.validate.ts) вместе со схемой
// (env.validation.ts) — одна спека на пару файлов: смысл у них общий.
import { validateEnv } from './env.validate';

const VALID_PROD: Record<string, unknown> = {
  NODE_ENV: 'production',
  PORT: '3000',
  MONGODB_URI: 'mongodb+srv://user:pass@cluster.mongodb.net/xuanxue',
  ENCRYPTION_KEY: 'a1'.repeat(32),
  JWT_SECRET: 'x'.repeat(32),
  PUBLIC_URL: 'https://cabinet.xuanxue.example',
  BOT_TOKEN: `123456789:${'x'.repeat(30)}`,
  TELEGRAM_WEBHOOK_SECRET: 'a1B2_c3-D4',
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

  it('production без BOT_TOKEN падает', () => {
    const { BOT_TOKEN: _drop, ...rest } = VALID_PROD;
    expect(() => validateEnv(rest)).toThrow(/BOT_TOKEN обязателен в production/);
  });

  it('production без TELEGRAM_WEBHOOK_SECRET падает', () => {
    const { TELEGRAM_WEBHOOK_SECRET: _drop, ...rest } = VALID_PROD;
    expect(() => validateEnv(rest)).toThrow(
      /TELEGRAM_WEBHOOK_SECRET обязателен в production/,
    );
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

  it('кривой BOT_TOKEN падает в production, валидный проходит', () => {
    expect(() => validateEnv({ ...VALID_PROD, BOT_TOKEN: 'not-a-token' })).toThrow(
      /BOT_TOKEN/,
    );
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('кривой BOT_TOKEN падает и вне production (формат проверяется всегда)', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        BOT_TOKEN: 'not-a-token',
      }),
    ).toThrow(/BOT_TOKEN/);
  });

  it('кривой TELEGRAM_WEBHOOK_SECRET падает в production, валидный проходит', () => {
    expect(() =>
      validateEnv({ ...VALID_PROD, TELEGRAM_WEBHOOK_SECRET: 'секрет с пробелом' }),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('кривой TELEGRAM_WEBHOOK_SECRET падает и вне production (формат проверяется всегда)', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        TELEGRAM_WEBHOOK_SECRET: 'секрет с пробелом',
      }),
    ).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
  });

  it('development без секретов, BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET проходит с дефолтами', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/xuanxue' });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.ENCRYPTION_KEY).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
    expect(env.PUBLIC_URL).toBeUndefined();
    expect(env.BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_WEBHOOK_SECRET).toBeUndefined();
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

  it('RAILWAY_GIT_COMMIT_SHA: валидный SHA проходит, отсутствующий — тоже', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      RAILWAY_GIT_COMMIT_SHA: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567',
    });
    expect(env.RAILWAY_GIT_COMMIT_SHA).toBe('a1b2c3d4e5f60718293a4b5c6d7e8f901234567');
    expect(
      validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x' }).RAILWAY_GIT_COMMIT_SHA,
    ).toBeUndefined();
  });

  it('RAILWAY_GIT_COMMIT_SHA: не hex или короче 7 символов — падает; пустая строка — отсутствует', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        RAILWAY_GIT_COMMIT_SHA: 'не-sha',
      }),
    ).toThrow(/RAILWAY_GIT_COMMIT_SHA/);

    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      RAILWAY_GIT_COMMIT_SHA: '',
    });
    expect(env.RAILWAY_GIT_COMMIT_SHA).toBeUndefined();
  });

  it('HEARTBEAT_PING_URL: валидный http(s) URL проходит, отсутствующий — тоже', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      HEARTBEAT_PING_URL: 'https://hc-ping.com/11111111-2222-3333-4444-555555555555',
    });
    expect(env.HEARTBEAT_PING_URL).toBe(
      'https://hc-ping.com/11111111-2222-3333-4444-555555555555',
    );
    expect(
      validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x' }).HEARTBEAT_PING_URL,
    ).toBeUndefined();
  });

  it('HEARTBEAT_PING_URL: не URL — падает; пустая строка — отсутствует', () => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        HEARTBEAT_PING_URL: 'не-урл',
      }),
    ).toThrow(/HEARTBEAT_PING_URL/);

    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      HEARTBEAT_PING_URL: '',
    });
    expect(env.HEARTBEAT_PING_URL).toBeUndefined();
  });

  it('production без HEARTBEAT_PING_URL тоже поднимается — не обязателен нигде', () => {
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });
});

// Файлы материалов в R2 (ADR-0057). Главное здесь — первый тест: без ключей
// кабинет поднимается как прежде. Иначе локальная разработка, CI и
// Docker-смок встали бы из-за внешнего сервиса, которому там нечего делать.
describe('validateEnv: Cloudflare R2 (ADR-0057)', () => {
  const R2_SET = {
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'b'.repeat(32),
    R2_SECRET_ACCESS_KEY: 'c'.repeat(64),
    R2_BUCKET: 'xuanxue-materials',
  };

  it('без единой переменной R2 конфигурация валидна — хранилище просто выключено', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x' });
    expect(env.R2_ACCOUNT_ID).toBeUndefined();
    expect(env.R2_BUCKET).toBeUndefined();
  });

  it('production без переменных R2 тоже поднимается', () => {
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('четыре пустые строки в .env считаются отсутствием, а не половиной набора', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      R2_ACCOUNT_ID: '',
      R2_ACCESS_KEY_ID: '',
      R2_SECRET_ACCESS_KEY: '',
      R2_BUCKET: '',
    });
    expect(env.R2_ACCESS_KEY_ID).toBeUndefined();
  });

  it('полный набор проходит', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x', ...R2_SET });
    expect(env.R2_BUCKET).toBe('xuanxue-materials');
  });

  it.each(Object.keys(R2_SET))('без %s набор неполон — старт падает', (missing) => {
    const partial: Record<string, unknown> = {
      MONGODB_URI: 'mongodb://localhost:27017/x',
      ...R2_SET,
    };
    delete partial[missing];
    expect(() => validateEnv(partial)).toThrow(new RegExp(missing));
  });

  it.each([
    ['R2_ACCOUNT_ID', 'evil.example.com/'],
    ['R2_ACCESS_KEY_ID', 'ключ'],
    ['R2_SECRET_ACCESS_KEY', 'коротко'],
    // Слэш в имени бакета увёл бы запрос по другому пути внутри аккаунта.
    ['R2_BUCKET', 'bucket/../other'],
  ])('%s кривого вида роняет старт', (key, value) => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        ...R2_SET,
        [key]: value,
      }),
    ).toThrow(new RegExp(key));
  });
});

// Push-уведомления браузера (ADR-0092). Главное — первый тест: без ключей
// кабинет поднимается как прежде, риск остаётся за флагом (CLAUDE.md).
describe('validateEnv: VAPID (ADR-0092)', () => {
  const VAPID_SET = {
    VAPID_PUBLIC_KEY: 'A'.repeat(87),
    VAPID_PRIVATE_KEY: 'B'.repeat(43),
    VAPID_SUBJECT: 'mailto:school@example.com',
  };

  it('без единой переменной VAPID конфигурация валидна — push просто выключен', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x' });
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
    expect(env.VAPID_PRIVATE_KEY).toBeUndefined();
    expect(env.VAPID_SUBJECT).toBeUndefined();
  });

  it('production без переменных VAPID тоже поднимается — push не обязателен нигде', () => {
    expect(() => validateEnv(VALID_PROD)).not.toThrow();
  });

  it('три пустые строки в .env считаются отсутствием, а не половиной набора', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
    });
    expect(env.VAPID_PUBLIC_KEY).toBeUndefined();
  });

  it('полный набор проходит', () => {
    const env = validateEnv({ MONGODB_URI: 'mongodb://localhost:27017/x', ...VAPID_SET });
    expect(env.VAPID_SUBJECT).toBe('mailto:school@example.com');
  });

  it('VAPID_SUBJECT в виде https:// тоже проходит', () => {
    const env = validateEnv({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      ...VAPID_SET,
      VAPID_SUBJECT: 'https://xuanxue.su/contact',
    });
    expect(env.VAPID_SUBJECT).toBe('https://xuanxue.su/contact');
  });

  it.each(Object.keys(VAPID_SET))('без %s набор неполон — старт падает', (missing) => {
    const partial: Record<string, unknown> = {
      MONGODB_URI: 'mongodb://localhost:27017/x',
      ...VAPID_SET,
    };
    delete partial[missing];
    expect(() => validateEnv(partial)).toThrow(new RegExp(missing));
  });

  it.each([
    ['VAPID_PUBLIC_KEY', 'A'.repeat(86)],
    ['VAPID_PRIVATE_KEY', 'коротко'],
    ['VAPID_SUBJECT', 'не-похоже-на-адрес'],
  ])('%s кривого вида роняет старт', (key, value) => {
    expect(() =>
      validateEnv({
        MONGODB_URI: 'mongodb://localhost:27017/x',
        ...VAPID_SET,
        [key]: value,
      }),
    ).toThrow(new RegExp(key));
  });
});
