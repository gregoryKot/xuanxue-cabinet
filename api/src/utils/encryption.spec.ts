// loadKeys() читает process.env один раz при импорте модуля — поэтому каждый
// тест сначала выставляет env, затем require'ит модуль заново через
// jest.resetModules() (аналог `jest.isolateModules` для CJS require).
const KEY_A = 'a1'.repeat(32);
const KEY_B = 'b2'.repeat(32);

type EncryptionModule = typeof import('./encryption');

function loadWithEnv(env: Record<string, string | undefined>): EncryptionModule {
  jest.resetModules();
  const prev = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('./encryption') as EncryptionModule;
  process.env = prev;
  return mod;
}

describe('encryption', () => {
  it('roundtrip: encrypt → decrypt возвращает исходный текст', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const cipher = mod.encrypt('привет, школа');
    expect(cipher).not.toBe('привет, школа');
    expect(mod.decrypt(cipher)).toBe('привет, школа');
  });

  it('читает блоб, зашифрованный старым ключом, через ENCRYPTION_KEY_OLD', () => {
    const oldMod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const cipher = oldMod.encrypt('секретная ссылка на zoom');

    const rotatedMod = loadWithEnv({ ENCRYPTION_KEY: KEY_B, ENCRYPTION_KEY_OLD: KEY_A });
    expect(rotatedMod.decrypt(cipher)).toBe('секретная ссылка на zoom');
    // Новый текст шифруется уже текущим (новым) ключом.
    const freshCipher = rotatedMod.encrypt('новый текст');
    const onlyOldMod = loadWithEnv({
      ENCRYPTION_KEY: KEY_A,
      ENCRYPTION_KEY_OLD: undefined,
    });
    expect(onlyOldMod.decrypt(freshCipher)).not.toBe('новый текст');
  });

  it('испорченный шифротекст не расшифровывается молча', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const cipher = mod.encrypt('текст для порчи');
    if (cipher === null) throw new Error('encrypt вернул null для непустого текста');
    const bytes = Buffer.from(cipher, 'base64');
    const lastIndex = bytes.length - 1;
    const lastByte = bytes[lastIndex];
    if (lastByte === undefined) throw new Error('пустой буфер шифротекста');
    bytes[lastIndex] = lastByte ^ 0xff; // портим последний байт данных
    const tampered = bytes.toString('base64');

    expect(mod.decrypt(tampered)).not.toBe('текст для порчи');
    // GCM отбрасывает аутентификацию — функция возвращает исходный (испорченный)
    // блоб как есть, а не бросает исключение и не подменяет тишиной.
    expect(mod.decrypt(tampered)).toBe(tampered);
  });

  it('encryptRecord/decryptRecord: связка сохранения и чтения по схеме', () => {
    const mod = loadWithEnv({ ENCRYPTION_KEY: KEY_A, ENCRYPTION_KEY_OLD: undefined });
    const schema = { strings: ['note'], jsonArrays: ['items'] };
    const saved = mod.encryptRecord(
      { id: '1', note: 'заметка', items: ['a', 'b'] },
      schema,
    );
    expect(saved.note).not.toBe('заметка');
    const loaded = mod.decryptRecord(saved, schema);
    expect(loaded).toEqual({ id: '1', note: 'заметка', items: ['a', 'b'] });
  });
});
