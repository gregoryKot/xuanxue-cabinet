// Чистая логика «что считать правкой» — без Mongo и DI (CLAUDE.md «Тесты»).
import { buildHistoryEntry, hasContentChanged } from './exam-item-content-change';
import type { ExamItemOptionRecord } from './exam-item.schema';

const OPTIONS: ExamItemOptionRecord[] = [
  { id: 'o1', text: 'Расслабить поясницу', correct: true },
  { id: 'o2', text: 'Поднять плечи', correct: false },
];

const CURRENT = {
  prompt: 'Что делает поясница в стойке?',
  options: OPTIONS,
};

describe('hasContentChanged', () => {
  it('тело без содержательных полей (сменили только статус) — не правка', () => {
    expect(hasContentChanged({ status: 'archived' }, undefined, CURRENT)).toBe(false);
  });

  it('те же значения, что в вопросе — не правка: экран шлёт поля всегда', () => {
    const input = { prompt: CURRENT.prompt };

    expect(hasContentChanged(input, OPTIONS, CURRENT)).toBe(false);
  });

  it('другая формулировка — правка', () => {
    expect(hasContentChanged({ prompt: 'Другой вопрос' }, undefined, CURRENT)).toBe(true);
  });

  it('текст варианта поменяли — правка', () => {
    const changed: ExamItemOptionRecord[] = [
      { id: 'o1', text: 'Расслабить поясницу и таз', correct: true },
      { id: 'o2', text: 'Поднять плечи', correct: false },
    ];

    expect(hasContentChanged({}, changed, CURRENT)).toBe(true);
  });

  it('отметку «верно» переставили — правка', () => {
    const changed: ExamItemOptionRecord[] = [
      { id: 'o1', text: 'Расслабить поясницу', correct: false },
      { id: 'o2', text: 'Поднять плечи', correct: true },
    ];

    expect(hasContentChanged({}, changed, CURRENT)).toBe(true);
  });

  it('вариант добавили — правка', () => {
    const changed = [...OPTIONS, { id: 'o3', text: 'Согнуть колени', correct: false }];

    expect(hasContentChanged({}, changed, CURRENT)).toBe(true);
  });

  // ADR-0133: видео вопроса — тоже содержание, как и формулировка.
  it('добавили videoId вопроса — правка', () => {
    expect(hasContentChanged({ videoId: 'vid1' }, undefined, CURRENT)).toBe(true);
  });

  it('videoId не пришёл в теле — не правка (не трогаем то, что не прислали)', () => {
    expect(hasContentChanged({ prompt: CURRENT.prompt }, undefined, CURRENT)).toBe(false);
  });

  it('сняли videoId (null) у вопроса, у которого он был — правка', () => {
    const current = { ...CURRENT, videoId: 'vid1' };
    expect(hasContentChanged({ videoId: null }, undefined, current)).toBe(true);
  });

  it('добавили videoUrl вопроса — правка', () => {
    expect(
      hasContentChanged({ videoUrl: 'https://youtu.be/x' }, undefined, CURRENT),
    ).toBe(true);
  });
});

describe('buildHistoryEntry', () => {
  it('снимает содержательные поля текущей редакции с переданным replacedAt', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, version: 3 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry).toEqual({
      version: 3,
      prompt: CURRENT.prompt,
      options: OPTIONS,
      replacedAt: '2026-09-12T10:00:00.000Z',
    });
  });

  it('видео вопроса не было — ключей videoId/videoUrl в записи нет вовсе', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, version: 1 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry).not.toHaveProperty('videoId');
    expect(entry).not.toHaveProperty('videoUrl');
  });

  it('видео вопроса было — попадает в снимок', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, videoId: 'vid1', version: 1 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry.videoId).toBe('vid1');
  });

  it('видео-ссылка вопроса была — попадает в снимок', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, videoUrl: 'https://youtu.be/x', version: 1 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry.videoUrl).toBe('https://youtu.be/x');
  });
});

describe('hasContentChanged — askReason (ADR-0146)', () => {
  it('askReason не пришёл в теле — не правка', () => {
    expect(hasContentChanged({ prompt: CURRENT.prompt }, undefined, CURRENT)).toBe(false);
  });

  it('askReason включили — правка', () => {
    expect(hasContentChanged({ askReason: true }, undefined, CURRENT)).toBe(true);
  });

  it('askReason прислали тем же значением, что уже стоит — не правка', () => {
    expect(
      hasContentChanged({ askReason: true }, undefined, { ...CURRENT, askReason: true }),
    ).toBe(false);
  });
});

describe('buildHistoryEntry — askReason (ADR-0146)', () => {
  it('askReason стоял — попадает в снимок истории', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, askReason: true, version: 1 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry.askReason).toBe(true);
  });

  it('askReason не стоял — ключа в снимке нет', () => {
    const entry = buildHistoryEntry(
      { ...CURRENT, version: 1 },
      '2026-09-12T10:00:00.000Z',
    );

    expect(entry.askReason).toBeUndefined();
  });
});
