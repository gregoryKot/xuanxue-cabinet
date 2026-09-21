// Чистые функции, без DI и без сети (CLAUDE.md «Тесты»).
import type { ConfigService } from '@nestjs/config';
import { objectUrl, readR2Config } from './r2.config';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const FULL = {
  R2_ACCOUNT_ID: 'abc123abc123abc123abc123abc123ab',
  R2_ACCESS_KEY_ID: 'R2ACCESSKEYEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'r2secretkeyexample0000000000000000000000',
  R2_BUCKET: 'school-files',
};

describe('readR2Config', () => {
  it('собирает адрес эндпоинта из R2_ACCOUNT_ID и область подписи auto/s3', () => {
    const config = readR2Config(fakeConfig(FULL));
    expect(config?.endpoint).toBe(
      'https://abc123abc123abc123abc123abc123ab.r2.cloudflarestorage.com',
    );
    expect(config?.bucket).toBe('school-files');
    expect(config?.credentials.region).toBe('auto');
    expect(config?.credentials.service).toBe('s3');
  });

  it('пустой набор — null, кабинет живёт без хранилища', () => {
    expect(readR2Config(fakeConfig({}))).toBeNull();
  });
});

describe('objectUrl', () => {
  // Явная проверка вместо `!`: полный набор выше гарантирует конфигурацию,
  // но non-null assertion в проекте — предупреждение (CLAUDE.md «Код»).
  const config = readR2Config(fakeConfig(FULL));
  if (!config) throw new Error('readR2Config вернул null на полном наборе переменных');

  it('ставит ключ в путь за именем бакета', () => {
    expect(objectUrl(config, 'materials/64b8f0a1c2d3e4f5a6b7c8d9/3f1a')).toBe(
      'https://abc123abc123abc123abc123abc123ab.r2.cloudflarestorage.com/' +
        'school-files/materials/64b8f0a1c2d3e4f5a6b7c8d9/3f1a',
    );
  });

  // Ключи мы собираем сами из безопасных символов, но кодирование здесь —
  // единственное место, где оно происходит: подпись считается по этому же
  // пути (sigv4-canonical.ts), и второй раз кодировать его нельзя.
  it('кодирует сегменты ключа, разделители пути оставляет', () => {
    expect(objectUrl(config, 'materials/имя файла.pdf')).toBe(
      'https://abc123abc123abc123abc123abc123ab.r2.cloudflarestorage.com/' +
        'school-files/materials/' +
        '%D0%B8%D0%BC%D1%8F%20%D1%84%D0%B0%D0%B9%D0%BB%D0%B0.pdf',
    );
  });
});
