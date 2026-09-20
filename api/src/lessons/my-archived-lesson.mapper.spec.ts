// Юнит-тест toMyArchivedLessonDto — без Mongo и DI (CLAUDE.md «Тесты»,
// уровень «чистая логика»). Три случая записи (ссылка / только
// telegramFileId / пусто) и явная проверка, что telegramFileId не попадает
// в DTO ни в каком виде (ТЗ docs/PLAN.md §14 слой 3.3).
import { Types } from 'mongoose';
import {
  toMyArchivedLessonDto,
  type MyArchivedLessonClassInput,
  type MyArchivedLessonInput,
} from './my-archived-lesson.mapper';

const CLASS: MyArchivedLessonClassInput = {
  title: 'Тайцзицюань, начинающие',
  groupLabel: 'группа А',
};

function lesson(overrides: Partial<MyArchivedLessonInput> = {}): MyArchivedLessonInput {
  return {
    _id: new Types.ObjectId(),
    startsAt: new Date('2026-09-01T16:00:00.000Z'),
    topic: 'Форма 24',
    status: 'scheduled',
    recordings: [],
    ...overrides,
  };
}

describe('toMyArchivedLessonDto', () => {
  it('переносит время в ISO UTC с Z, класс, тему и статус занятия', () => {
    const dto = toMyArchivedLessonDto(lesson({ status: 'cancelled' }), CLASS);
    expect(dto.startsAt).toBe('2026-09-01T16:00:00.000Z');
    expect(dto.classTitle).toBe(CLASS.title);
    expect(dto.groupLabel).toBe(CLASS.groupLabel);
    expect(dto.topic).toBe('Форма 24');
    expect(dto.status).toBe('cancelled');
  });

  it('запись со ссылкой — title и url, без telegramFileId', () => {
    const dto = toMyArchivedLessonDto(
      lesson({
        recordings: [{ title: 'Занятие целиком', url: 'https://cloud.example/rec-1' }],
      }),
      CLASS,
    );
    expect(dto.recordings).toEqual([
      { title: 'Занятие целиком', url: 'https://cloud.example/rec-1' },
    ]);
  });

  it('запись только с telegramFileId — inTelegramOnly: true, без url', () => {
    const dto = toMyArchivedLessonDto(
      lesson({
        recordings: [{ title: 'Занятие целиком', telegramFileId: 'BAACAgIA-secret' }],
      }),
      CLASS,
    );
    expect(dto.recordings).toEqual([{ title: 'Занятие целиком', inTelegramOnly: true }]);
  });

  it('telegramFileId ни в каком виде не попадает в DTO', () => {
    const dto = toMyArchivedLessonDto(
      lesson({
        recordings: [{ title: 'Занятие целиком', telegramFileId: 'BAACAgIA-secret' }],
      }),
      CLASS,
    );
    expect(JSON.stringify(dto)).not.toContain('BAACAgIA-secret');
    expect(JSON.stringify(dto)).not.toContain('telegramFileId');
  });

  it('запись без url и без telegramFileId — пропущена совсем', () => {
    const dto = toMyArchivedLessonDto(
      lesson({ recordings: [{ title: 'Пустая запись' }] }),
      CLASS,
    );
    expect(dto.recordings).toEqual([]);
  });

  it('несколько записей — сохраняется порядок, каждая своего вида', () => {
    const dto = toMyArchivedLessonDto(
      lesson({
        recordings: [
          { title: 'Ссылка', url: 'https://cloud.example/rec-2' },
          { title: 'В канале', telegramFileId: 'BAACAgIA-other' },
          { title: 'Пустая' },
        ],
      }),
      CLASS,
    );
    expect(dto.recordings).toEqual([
      { title: 'Ссылка', url: 'https://cloud.example/rec-2' },
      { title: 'В канале', inTelegramOnly: true },
    ]);
  });

  // ADR-0071: тег видит и ученик и в архиве — та же рубрика, что в «ближайших».
  it('теги приезжают как есть', () => {
    const dto = toMyArchivedLessonDto(lesson({ tags: ['дракон', 'начинающие'] }), CLASS);
    expect(dto.tags).toEqual(['дракон', 'начинающие']);
  });

  // Дата занятия до ADR-0071 не хранит поле в документе — маппер сам отдаёт [].
  it('документ без поля tags — []', () => {
    const dto = toMyArchivedLessonDto(lesson(), CLASS);
    expect(dto.tags).toEqual([]);
  });
});
