// Юнит-тест toSchoolEventDto — без Mongo и DI.
import { Types } from 'mongoose';
import { toSchoolEventDto, type RawLeanSchoolEvent } from './school-event.mapper';

function event(overrides: Partial<RawLeanSchoolEvent> = {}): RawLeanSchoolEvent {
  return {
    _id: new Types.ObjectId(),
    title: 'Ретрит в Галилее',
    startsAt: new Date('2026-11-10T07:00:00.000Z'),
    createdBy: new Types.ObjectId(),
    createdAt: new Date('2026-10-07T08:00:00.000Z'),
    updatedAt: new Date('2026-10-07T08:00:00.000Z'),
    ...overrides,
  };
}

describe('toSchoolEventDto', () => {
  it('переносит поля, даты — ISO UTC с Z, createdBy — строкой', () => {
    const doc = event({
      endsAt: new Date('2026-11-12T15:00:00.000Z'),
      place: 'Кибуц Амиад',
      description: 'Что **взять**',
    });

    expect(toSchoolEventDto(doc)).toEqual({
      id: doc._id.toString(),
      title: 'Ретрит в Галилее',
      startsAt: '2026-11-10T07:00:00.000Z',
      endsAt: '2026-11-12T15:00:00.000Z',
      place: 'Кибуц Амиад',
      description: 'Что **взять**',
      createdBy: doc.createdBy?.toString(),
      createdAt: '2026-10-07T08:00:00.000Z',
    });
  });

  it('необязательные поля отсутствуют — в DTO undefined', () => {
    const dto = toSchoolEventDto(event());

    expect(dto.endsAt).toBeUndefined();
    expect(dto.place).toBeUndefined();
    expect(dto.description).toBeUndefined();
  });

  // Регрессия инцидента 2026-10-02: после удаления аккаунта автора `createdBy`
  // обнуляется ($unset), маппер не должен падать.
  it('документ без createdBy (аккаунт автора удалён) — не падает', () => {
    const { createdBy: _createdBy, ...doc } = event();

    expect(toSchoolEventDto(doc).createdBy).toBeUndefined();
  });
});
