// Чистая логика — без Mongo и без DI (CLAUDE.md «Тесты»).
import { describe, expect, it } from 'vitest';
import {
  CLIENT_ERROR_LIMITS,
  CLIENT_ERROR_PATH_RE,
  clampClientErrorText,
} from './client-errors';

describe('clampClientErrorText', () => {
  it('короткий текст отдаёт как есть', () => {
    expect(clampClientErrorText('boom', 100)).toBe('boom');
  });

  it('схлопывает переносы и лишние пробелы в одну строку', () => {
    expect(clampClientErrorText('TypeError:\n  x\tне\n\nопределён', 100)).toBe(
      'TypeError: x не определён',
    );
  });

  it('обрезает края', () => {
    expect(clampClientErrorText('   boom   ', 100)).toBe('boom');
  });

  it('длинный текст режет до ровно max знаков, последний — многоточие', () => {
    const clamped = clampClientErrorText('a'.repeat(500), 10);

    expect(clamped).toHaveLength(10);
    expect(clamped).toBe('aaaaaaaaa…');
  });

  it('текст ровно по границе не трогает', () => {
    expect(clampClientErrorText('a'.repeat(10), 10)).toBe('a'.repeat(10));
  });

  it('пустая строка остаётся пустой, не превращается в многоточие', () => {
    expect(clampClientErrorText('   ', 10)).toBe('');
  });
});

describe('CLIENT_ERROR_PATH_RE', () => {
  it('пропускает адрес экрана', () => {
    expect(CLIENT_ERROR_PATH_RE.test('/planning/507f1f77bcf86cd799439011')).toBe(true);
  });

  it('пропускает корень', () => {
    expect(CLIENT_ERROR_PATH_RE.test('/')).toBe(true);
  });

  // Без этой проверки в поле `path` приехала бы внешняя ссылка и попала бы в
  // лог и в сообщение админу как «адрес сбоя».
  it('не пропускает внешнюю ссылку', () => {
    expect(CLIENT_ERROR_PATH_RE.test('https://evil.example/x')).toBe(false);
  });

  it('не пропускает адрес без ведущего слэша и с пробелом', () => {
    expect(CLIENT_ERROR_PATH_RE.test('exams')).toBe(false);
    expect(CLIENT_ERROR_PATH_RE.test('/ex ams')).toBe(false);
  });
});

describe('CLIENT_ERROR_LIMITS', () => {
  // Потолок DTO отвергает злоупотребление, обрезка спасает отчёт чуть длиннее
  // нормы — порядок между числами держит именно этот смысл.
  it('жёсткий потолок поля шире, чем то, что доезжает до лога', () => {
    expect(CLIENT_ERROR_LIMITS.fieldHardMax).toBeGreaterThan(CLIENT_ERROR_LIMITS.message);
    expect(CLIENT_ERROR_LIMITS.fieldHardMax).toBeGreaterThan(CLIENT_ERROR_LIMITS.path);
  });
});
