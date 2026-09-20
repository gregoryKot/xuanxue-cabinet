// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты», уровень «чистая
// логика»). Опасные символы попадают в заголовок Content-Disposition
// подписанной ссылки (material-file-name.ts) — здесь проверяется, что они
// не проходят, а не то, как выглядит сам заголовок.
import { MATERIAL_FILE_LIMITS } from '@xuanxue/shared';
import { safeFileName } from './material-file-name';

describe('safeFileName', () => {
  it('обычное имя проходит как есть', () => {
    expect(safeFileName('Ба-гуа-чжан.pdf')).toBe('Ба-гуа-чжан.pdf');
  });

  it('кириллица сохраняется', () => {
    expect(safeFileName('Методичка по тайцзицюань.pdf')).toBe(
      'Методичка по тайцзицюань.pdf',
    );
  });

  // Перевод строки в имени — это второй заголовок в ответе хранилища
  // (комментарий material-file-name.ts).
  it('перевод строки и \\r вычищаются', () => {
    expect(safeFileName('файл\r\nSet-Cookie: evil=1.pdf')).toBe(
      'файл Set-Cookie: evil=1.pdf',
    );
  });

  it('кавычка и обратный слэш вычищаются', () => {
    expect(safeFileName('на"зад\\вперёд.pdf')).toBe('на зад вперёд.pdf');
  });

  it('../../etc/passwd не оставляет разделителей пути', () => {
    expect(safeFileName('../../etc/passwd')).toBe('.. .. etc passwd');
  });

  it('имя длиннее MATERIAL_FILE_LIMITS.name — обрезается', () => {
    const long = 'a'.repeat(MATERIAL_FILE_LIMITS.name + 50);

    const cleaned = safeFileName(long);

    expect(cleaned).toHaveLength(MATERIAL_FILE_LIMITS.name);
    expect(cleaned).toBe('a'.repeat(MATERIAL_FILE_LIMITS.name));
  });

  it('имя из одних запрещённых символов — запасное непустое имя', () => {
    expect(safeFileName('///\\\\\n\r"')).toBe('material');
  });
});
