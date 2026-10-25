// Юнит-тест projectPublicLesson — без Mongo и DI (ADR-0170). Главное: на
// входе лежат Zoom-поля класса и override занятия, на выходе их нет и набор
// ключей ровно по контракту Workshop; битая строка даёт причину, а не DTO и
// не исключение (контракт, случай 6).
import { Types } from 'mongoose';
import type { PublicLessonDto } from '@xuanxue/shared';
import { projectPublicLesson, type PublicLessonProjection } from './public-lesson.mapper';

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

function dtoOf(projection: PublicLessonProjection): PublicLessonDto {
  if (!('dto' in projection)) throw new Error(`ожидали DTO, а не ${projection.reason}`);
  return projection.dto;
}

describe('projectPublicLesson', () => {
  it('ровно поля контракта, без Zoom класса и занятия', () => {
    const dto = dtoOf(projectPublicLesson(lesson({ tags: ['дракон'] }), CLASS));
    expect(Object.keys(dto).sort()).toEqual(CONTRACT_KEYS);
    expect(dto.tags).toEqual(['дракон']);
    expect(JSON.stringify(dto)).not.toContain('zoom');
  });

  it('classId — строка, startsAt — ISO UTC с Z', () => {
    const dto = dtoOf(projectPublicLesson(lesson(), CLASS));
    expect(dto.classId).toBe(CLASS_ID.toString());
    expect(dto.startsAt).toBe('2026-10-05T15:00:00.000Z');
  });

  it('нет адреса у класса — ключа location нет', () => {
    const dto = dtoOf(projectPublicLesson(lesson(), { ...CLASS, location: undefined }));
    expect('location' in dto).toBe(false);
    expect(Object.keys(dto)).toHaveLength(CONTRACT_KEYS.length - 1);
  });

  it('пустая строка адреса отдаётся как есть — контракт не считает её отсутствием', () => {
    const dto = dtoOf(projectPublicLesson(lesson(), { ...CLASS, location: '' }));
    expect(dto.location).toBe('');
  });

  it('нет тегов у занятия (данные до ADR-0075) — пустой массив', () => {
    expect(dtoOf(projectPublicLesson(lesson(), CLASS)).tags).toEqual([]);
  });

  it('пустые строки и нулевая длительность остаются в ответе', () => {
    const dto = dtoOf(
      projectPublicLesson(lesson({ topic: '', durationMin: 0 }), {
        ...CLASS,
        title: '',
        groupLabel: '',
        location: '',
      }),
    );
    expect(dto).toMatchObject({
      topic: '',
      classTitle: '',
      groupLabel: '',
      location: '',
      durationMin: 0,
    });
  });

  it('класса нет — причина, не DTO', () => {
    expect(projectPublicLesson(lesson(), undefined)).toEqual({
      reason: 'класс не найден',
    });
  });

  // Значения, которые схема не пустила бы при записи, но lean() из уже
  // лежащего документа отдаёт как есть. Каст — они вне объявленного типа.
  it.each([
    ['нет durationMin', { durationMin: undefined }, {}, 'durationMin'],
    ['durationMin NaN', { durationMin: Number.NaN }, {}, 'durationMin'],
    [
      'durationMin Infinity',
      { durationMin: Number.POSITIVE_INFINITY },
      {},
      'durationMin',
    ],
    ['durationMin строка', { durationMin: '60' }, {}, 'durationMin'],
    ['startsAt не дата', { startsAt: undefined }, {}, 'startsAt'],
    ['startsAt невалидная дата', { startsAt: new Date('мусор') }, {}, 'startsAt'],
    ['topic не строка', { topic: undefined }, {}, 'topic'],
    ['status вне перечисления', { status: 'done' }, {}, 'status'],
    ['_id не ObjectId', { _id: 'abc' }, {}, '_id'],
    ['classId не ObjectId', { classId: undefined }, {}, 'classId'],
    ['tags не массив', { tags: 'дракон' }, {}, 'tags'],
    ['в tags не строка', { tags: [1] }, {}, 'tags'],
    ['format вне перечисления', {}, { format: 'hybrid' }, 'format'],
    ['нет названия класса', {}, { title: undefined }, 'classTitle'],
    ['groupLabel не строка', {}, { groupLabel: 1 }, 'groupLabel'],
    ['location null', {}, { location: null }, 'location'],
  ])('%s — причина про %s', (_name, lessonPatch, classPatch, field) => {
    const projection = projectPublicLesson(lesson(lessonPatch), {
      ...CLASS,
      ...classPatch,
    } as typeof CLASS);
    expect(projection).not.toHaveProperty('dto');
    expect('reason' in projection && projection.reason).toContain(field);
  });
});
