// Юнит-тест toGradingCommentPresetDto — без Mongo и DI.
import { Types } from 'mongoose';
import {
  toGradingCommentPresetDto,
  type RawLeanGradingCommentPreset,
} from './grading-comment-preset.mapper';

function preset(
  overrides: Partial<RawLeanGradingCommentPreset> = {},
): RawLeanGradingCommentPreset {
  return {
    _id: new Types.ObjectId(),
    text: 'Держите центр тяжести',
    createdBy: new Types.ObjectId(),
    createdAt: new Date('2026-09-10T08:00:00.000Z'),
    updatedAt: new Date('2026-09-10T08:00:00.000Z'),
    ...overrides,
  };
}

describe('toGradingCommentPresetDto', () => {
  it('переносит поля, createdBy — строкой, дата — ISO UTC с Z', () => {
    const doc = preset({ title: 'Центр' });

    expect(toGradingCommentPresetDto(doc)).toEqual({
      id: doc._id.toString(),
      text: doc.text,
      title: 'Центр',
      createdBy: doc.createdBy?.toString(),
      createdAt: '2026-09-10T08:00:00.000Z',
    });
  });

  // Регрессия инцидента 2026-10-02 (500 после удаления аккаунта автора):
  // удаление аккаунта учителя делает $unset createdBy, заготовка остаётся.
  it('документ без createdBy (аккаунт автора удалён) — не падает, undefined', () => {
    const { createdBy: _createdBy, ...doc } = preset();

    expect(toGradingCommentPresetDto(doc).createdBy).toBeUndefined();
  });
});
