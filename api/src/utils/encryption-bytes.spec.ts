// Ключи читаются из process.env один раз при импорте encryption-keys.ts —
// каждый тест выставляет env и require'ит модуль заново через
// jest.resetModules(), тем же приёмом, что encryption.spec.ts.
// `export {}` — файл без import/export TypeScript считает скриптом с общей
// глобальной областью, и KEY_A/KEY_B столкнулись бы с такими же в
// encryption.spec.ts.
export {};

const KEY_A = 'a1'.repeat(32);
const KEY_B = 'b2'.repeat(32);

type BytesModule = typeof import('./encryption-bytes');

function loadWithEnv(env: Record<string, string | undefined>): BytesModule {
  jest.resetModules();
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./encryption-bytes') as BytesModule;
  process.env = prev;
  return mod;
}

// Сигнатура JPEG в начале — так же выглядит настоящая картинка варианта.
const IMAGE = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const IV_AND_TAG_BYTES = 12 + 16;

describe('encryption-bytes', () => {
  it('roundtrip: encryptBytes → decryptBytes возвращает те же байты', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const cipher = mod.encryptBytes(IMAGE);

    expect(cipher.equals(IMAGE)).toBe(false);
    expect(cipher.length).toBe(IMAGE.length + IV_AND_TAG_BYTES);
    expect(mod.decryptBytes(cipher).equals(IMAGE)).toBe(true);
  });

  it('пустой буфер: шифруется в iv+tag и расшифровывается обратно в пустой', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const cipher = mod.encryptBytes(Buffer.alloc(0));

    expect(cipher.length).toBe(IV_AND_TAG_BYTES);
    expect(mod.decryptBytes(cipher).length).toBe(0);
  });

  it('читает байты, зашифрованные старым ключом, через ENCRYPTION_KEY_OLD', () => {
    const oldMod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const cipher = oldMod.encryptBytes(IMAGE);

    const rotatedMod = loadWithEnv({ ENCRYPTION_KEY: KEY_B, ENCRYPTION_KEY_OLD: KEY_A });
    expect(rotatedMod.decryptBytes(cipher).equals(IMAGE)).toBe(true);

    // Новое шифруется уже текущим (новым) ключом — старому оно недоступно.
    const fresh = rotatedMod.encryptBytes(IMAGE);
    const onlyOldMod = loadWithEnv({
      ENCRYPTION_KEY: KEY_A,
      ENCRYPTION_KEY_OLD: undefined,
    });
    expect(onlyOldMod.decryptBytes(fresh).equals(IMAGE)).toBe(false);
  });

  it('испорченный шифротекст возвращается как есть, не подменяется пустотой', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const tampered = Buffer.from(mod.encryptBytes(IMAGE));
    const lastIndex = tampered.length - 1;
    const lastByte = tampered[lastIndex];
    if (lastByte === undefined) throw new Error('пустой буфер шифротекста');
    tampered[lastIndex] = lastByte ^ 0xff;

    const result = mod.decryptBytes(tampered);
    expect(result.equals(IMAGE)).toBe(false);
    expect(result.equals(tampered)).toBe(true);
  });

  it('без ключа вне production байты хранятся и читаются как есть', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: undefined, ENCRYPTION_KEY_OLD: undefined });

    expect(mod.encryptBytes(IMAGE).equals(IMAGE)).toBe(true);
    expect(mod.decryptBytes(IMAGE).equals(IMAGE)).toBe(true);
  });

  it('буфер короче iv+tag (записан без ключа) — читается как есть даже при настроенном ключе', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });

    expect(mod.decryptBytes(IMAGE).equals(IMAGE)).toBe(true);
  });
});
