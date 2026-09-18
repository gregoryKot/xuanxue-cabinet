// Чистая работа с localStorage черновика формы (ADR-0052) — каждая ветка
// хранения проверяется без React: запись/чтение, просрочка, порча записи,
// недоступное хранилище (приватный режим Safari, квота).
import { afterEach, describe, expect, it } from 'vitest';
import { clearAllDrafts, clearDraft, readDraft, writeDraft } from './formDraft';

const NOW = Date.UTC(2026, 8, 18);
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

afterEach(() => {
  localStorage.clear();
});

describe('writeDraft / readDraft', () => {
  it('запись читается тем же ключом', () => {
    writeDraft('exam-item:new', { prompt: 'Вопрос' }, NOW);

    expect(readDraft('exam-item:new', NOW)).toEqual({ prompt: 'Вопрос' });
  });

  it('чужой ключ не видит запись', () => {
    writeDraft('exam-item:new', { prompt: 'Вопрос' }, NOW);

    expect(readDraft('exam-item:e1', NOW)).toBeNull();
  });

  it('без записи — null', () => {
    expect(readDraft('exam-item:new', NOW)).toBeNull();
  });

  it('запись ровно на границе срока (7 суток) ещё жива', () => {
    writeDraft('exam-item:new', { prompt: 'Вопрос' }, NOW);

    expect(readDraft('exam-item:new', NOW + WEEK_MS)).toEqual({ prompt: 'Вопрос' });
  });

  it('запись старше 7 суток — просрочена и удаляется', () => {
    writeDraft('exam-item:new', { prompt: 'Вопрос' }, NOW);

    expect(readDraft('exam-item:new', NOW + WEEK_MS + 1)).toBeNull();
    // Не через readDraft повторно (он бы удалил её сам) — проверяем сырое
    // значение напрямую, чтобы отличить «удалили» от «TTL просто не совпал».
    expect(localStorage.getItem('xuanxue.draft.exam-item:new')).toBeNull();
  });

  it('битый JSON — null, запись удаляется', () => {
    localStorage.setItem('xuanxue.draft.exam-item:new', '{ не json');

    expect(readDraft('exam-item:new', NOW)).toBeNull();
    expect(localStorage.getItem('xuanxue.draft.exam-item:new')).toBeNull();
  });

  it('валидный JSON чужой формы (нет savedAt) — null, запись удаляется', () => {
    localStorage.setItem(
      'xuanxue.draft.exam-item:new',
      JSON.stringify({ prompt: 'Вопрос' }),
    );

    expect(readDraft('exam-item:new', NOW)).toBeNull();
    expect(localStorage.getItem('xuanxue.draft.exam-item:new')).toBeNull();
  });

  it('JSON-примитив вместо объекта — null, запись удаляется', () => {
    localStorage.setItem('xuanxue.draft.exam-item:new', JSON.stringify('просто строка'));

    expect(readDraft('exam-item:new', NOW)).toBeNull();
    expect(localStorage.getItem('xuanxue.draft.exam-item:new')).toBeNull();
  });

  it('недоступный localStorage — чтение и запись не бросают', () => {
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('приватный режим: доступ запрещён');
      },
    });

    expect(() => writeDraft('exam-item:new', { prompt: 'Вопрос' }, NOW)).not.toThrow();
    expect(readDraft('exam-item:new', NOW)).toBeNull();
    expect(() => clearDraft('exam-item:new')).not.toThrow();
    expect(() => clearAllDrafts()).not.toThrow();

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: original,
    });
  });
});

describe('clearDraft', () => {
  it('стирает только свою запись', () => {
    writeDraft('exam-item:new', { a: 1 }, NOW);
    writeDraft('exam-item:e1', { a: 2 }, NOW);

    clearDraft('exam-item:new');

    expect(readDraft('exam-item:new', NOW)).toBeNull();
    expect(readDraft('exam-item:e1', NOW)).toEqual({ a: 2 });
  });
});

describe('clearAllDrafts', () => {
  it('стирает все черновики, не трогая чужие ключи', () => {
    writeDraft('exam-item:new', { a: 1 }, NOW);
    writeDraft('exam:x1', { a: 2 }, NOW);
    localStorage.setItem('xuanxue:returnTo', '/exams');

    clearAllDrafts();

    expect(readDraft('exam-item:new', NOW)).toBeNull();
    expect(readDraft('exam:x1', NOW)).toBeNull();
    expect(localStorage.getItem('xuanxue:returnTo')).toBe('/exams');
  });

  it('пустое хранилище — не бросает', () => {
    expect(() => clearAllDrafts()).not.toThrow();
  });
});
