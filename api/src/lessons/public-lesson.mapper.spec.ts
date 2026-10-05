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
});
