// Юнит-тест toPublicLessonDto — без Mongo и DI (ADR-0170). Главное: на входе
// лежат Zoom-поля класса и override занятия, на выходе их нет и набор ключей
// ровно по контракту Workshop.
import { Types } from 'mongoose';
import { toPublicLessonDto } from './public-lesson.mapper';

const CLASS_ID = new Types.ObjectId();
const CONTRACT_KEYS = [
  'classId',
  'classTitle',
  'durationMin',
  'format',
  'groupLabel',
  'id',
  'location',
  'startsAt',
  'status',
  'tags',
  'topic',
];

const CLASS = {
  title: 'Тайцзицюань',
  groupLabel: 'группа А',
  format: 'both' as const,
  location: 'Тель-Авив',
  zoomLink: 'https://zoom.example/class',
  zoomPassword: 'class-pass',
};

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    classId: CLASS_ID,
    startsAt: new Date('2026-10-05T15:00:00.000Z'),
    durationMin: 60,
    topic: 'Форма 24',
    status: 'scheduled' as const,
    zoomLinkOverride: 'https://zoom.example/once',
    zoomPasswordOverride: 'once-pass',
    note: 'внутренняя заметка',
    ...overrides,
  };
}

describe('toPublicLessonDto', () => {
  it('ровно поля контракта, без Zoom класса и занятия', () => {
    const dto = toPublicLessonDto(lesson({ tags: ['дракон'] }), CLASS);
    expect(Object.keys(dto).sort()).toEqual(CONTRACT_KEYS);
    expect(dto.tags).toEqual(['дракон']);
    expect(JSON.stringify(dto)).not.toContain('zoom');
  });

  it('classId — строка, startsAt — ISO UTC с Z', () => {
    const dto = toPublicLessonDto(lesson(), CLASS);
    expect(dto.classId).toBe(CLASS_ID.toString());
    expect(dto.startsAt).toBe('2026-10-05T15:00:00.000Z');
  });

  it('нет адреса у класса — ключа location нет', () => {
    const dto = toPublicLessonDto(lesson(), { ...CLASS, location: undefined });
    expect('location' in dto).toBe(false);
    expect(Object.keys(dto)).toHaveLength(CONTRACT_KEYS.length - 1);
  });

  it('пустая строка адреса отдаётся как есть — контракт не считает её отсутствием', () => {
    expect(toPublicLessonDto(lesson(), { ...CLASS, location: '' }).location).toBe('');
  });

  it('нет тегов у занятия (данные до ADR-0075) — пустой массив', () => {
    expect(toPublicLessonDto(lesson(), CLASS).tags).toEqual([]);
  });

  it('пустые строки и нулевая длительность остаются в ответе', () => {
    const dto = toPublicLessonDto(lesson({ topic: '', durationMin: 0 }), {
      ...CLASS,
      title: '',
      groupLabel: '',
      location: '',
    });
    expect(dto.topic).toBe('');
    expect(dto.classTitle).toBe('');
    expect(dto.groupLabel).toBe('');
    expect(dto.location).toBe('');
    expect(dto.durationMin).toBe(0);
  });

  // Контракт, случай 6: битое обязательное поле — отказ всего ответа, не
  // дырка в JSON. Каст — значения, которые схема не пустила бы, но lean()
  // из уже лежащего документа отдаёт как есть.
  it.each([
    ['нет durationMin', { durationMin: undefined }, {}],
    ['durationMin NaN', { durationMin: Number.NaN }, {}],
    ['durationMin Infinity', { durationMin: Number.POSITIVE_INFINITY }, {}],
    ['durationMin строка', { durationMin: '60' }, {}],
    ['topic не строка', { topic: undefined }, {}],
    ['status вне перечисления', { status: 'done' }, {}],
    ['пустой id', { _id: { toString: () => '' } }, {}],
    ['tags не массив', { tags: 'дракон' }, {}],
    ['в tags не строка', { tags: [1] }, {}],
    ['format вне перечисления', {}, { format: 'hybrid' }],
    ['нет названия класса', {}, { title: undefined }],
    ['groupLabel не строка', {}, { groupLabel: 1 }],
    ['location null', {}, { location: null }],
  ])('%s — отказ', (_name, lessonPatch, classPatch) => {
    expect(() =>
      toPublicLessonDto(lesson(lessonPatch), {
        ...CLASS,
        ...classPatch,
      } as typeof CLASS),
    ).toThrow(/Публичное занятие/);
  });
});
