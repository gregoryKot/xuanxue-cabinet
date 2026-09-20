// Юнит-тест toMyLessonDto — без Mongo и DI (CLAUDE.md «Тесты», уровень
// «чистая логика»). Правило эффективной ссылки/пароля Zoom — как в
// post-renderer.spec.ts: override занятия важнее ссылки класса, пароль
// разовой ссылки не наследуется от пароля класса.
import { Types } from 'mongoose';
import {
  toMyLessonDto,
  type MyLessonClassInput,
  type MyLessonInput,
} from './my-lesson.mapper';

const CLASS: MyLessonClassInput = {
  title: 'Тайцзицюань, начинающие',
  groupLabel: 'группа А',
  format: 'online',
  location: undefined,
  zoomLink: 'https://zoom.example/class',
  zoomPassword: 'class-pass',
};

function lesson(overrides: Partial<MyLessonInput> = {}): MyLessonInput {
  return {
    _id: new Types.ObjectId(),
    startsAt: new Date('2026-09-15T16:00:00.000Z'),
    durationMin: 60,
    topic: 'Форма 24',
    status: 'scheduled',
    ...overrides,
  };
}

describe('toMyLessonDto', () => {
  it('без override — ссылка и пароль от класса', () => {
    const dto = toMyLessonDto(lesson(), CLASS);
    expect(dto.zoomLink).toBe(CLASS.zoomLink);
    expect(dto.zoomPassword).toBe(CLASS.zoomPassword);
  });

  it('с override ссылки — пароль класса не наследуется', () => {
    const dto = toMyLessonDto(
      lesson({ zoomLinkOverride: 'https://zoom.example/one-off' }),
      CLASS,
    );
    expect(dto.zoomLink).toBe('https://zoom.example/one-off');
    expect(dto.zoomPassword).toBeUndefined();
  });

  it('override ссылки со своим паролем — берётся пароль override', () => {
    const dto = toMyLessonDto(
      lesson({
        zoomLinkOverride: 'https://zoom.example/one-off',
        zoomPasswordOverride: 'one-off-pass',
      }),
      CLASS,
    );
    expect(dto.zoomLink).toBe('https://zoom.example/one-off');
    expect(dto.zoomPassword).toBe('one-off-pass');
  });

  it('переносит время в ISO UTC с Z и остальные поля класса/занятия', () => {
    const dto = toMyLessonDto(lesson({ status: 'cancelled' }), CLASS);
    expect(dto.startsAt).toBe('2026-09-15T16:00:00.000Z');
    expect(dto.classTitle).toBe(CLASS.title);
    expect(dto.groupLabel).toBe(CLASS.groupLabel);
    expect(dto.format).toBe(CLASS.format);
    expect(dto.status).toBe('cancelled');
  });

  // ADR-0071: тег видит и ученик — рубрика школы, не секрет.
  it('теги приезжают как есть', () => {
    const dto = toMyLessonDto(lesson({ tags: ['дракон', 'начинающие'] }), CLASS);
    expect(dto.tags).toEqual(['дракон', 'начинающие']);
  });

  // Дата занятия до ADR-0071 не хранит поле в документе — `.lean()` не
  // подставляет default схемы при чтении, маппер сам отдаёт [].
  it('документ без поля tags — []', () => {
    const dto = toMyLessonDto(lesson(), CLASS);
    expect(dto.tags).toEqual([]);
  });
});
