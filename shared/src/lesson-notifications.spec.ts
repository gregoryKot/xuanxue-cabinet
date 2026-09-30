import { describe, expect, it } from 'vitest';
import { isLessonInScope, LESSON_SCOPE_MODES } from './lesson-notifications';

describe('isLessonInScope', () => {
  it('режим «все» — любое занятие, даже если список пуст', () => {
    expect(isLessonInScope({ mode: 'all', classIds: [] }, 'c1')).toBe(true);
  });

  it('режим «все» не смотрит в сохранённые галочки', () => {
    expect(isLessonInScope({ mode: 'all', classIds: ['c2'] }, 'c1')).toBe(true);
  });

  it('«выбранные» — занятие из списка проходит', () => {
    expect(isLessonInScope({ mode: 'selected', classIds: ['c1', 'c2'] }, 'c2')).toBe(
      true,
    );
  });

  it('«выбранные» — занятия вне списка нет', () => {
    expect(isLessonInScope({ mode: 'selected', classIds: ['c2'] }, 'c1')).toBe(false);
  });

  it('«выбранные» без единой галочки — ни о каких, а не «все»', () => {
    expect(isLessonInScope({ mode: 'selected', classIds: [] }, 'c1')).toBe(false);
  });

  it('режимов ровно два, дефолт «все» стоит первым', () => {
    expect(LESSON_SCOPE_MODES).toEqual(['all', 'selected']);
  });
});
