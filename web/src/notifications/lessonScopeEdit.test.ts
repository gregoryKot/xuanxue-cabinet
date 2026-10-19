// Правка фильтра «о каких занятиях» (lessonScopeEdit.ts): из текущего выбора
// получается тело PUT для подсказки в ленте. Чистая логика, без React и сети.
import { describe, expect, it } from 'vitest';
import type { LessonScopeClassDto } from '@xuanxue/shared';
import { scopeWithMode, tickedClassIds } from './lessonScopeEdit';

const makeClass = (id: string): LessonScopeClassDto => ({
  id,
  title: `Занятие ${id}`,
  groupLabel: '',
  tz: 'Asia/Jerusalem',
  slots: [],
});

const CLASSES = [makeClass('c1'), makeClass('c2'), makeClass('c3')];

describe('tickedClassIds', () => {
  it('отмеченные занятия — в порядке списка, а не в порядке выбора', () => {
    expect(tickedClassIds({ mode: 'selected', classIds: ['c3', 'c1'] }, CLASSES)).toEqual(
      ['c1', 'c3'],
    );
  });

  it('id занятия, которого нет в списке (удалено, выключено), отбрасывается', () => {
    // Регрессия-страховка ADR-0162: сервер отвечает 400 на любой id, которого
    // нет в расписании, — один устаревший id не дал бы сохранить ничего.
    expect(
      tickedClassIds({ mode: 'selected', classIds: ['gone', 'c2'] }, CLASSES),
    ).toEqual(['c2']);
  });
});

describe('scopeWithMode', () => {
  it('смена режима на «все» оставляет галочки — вернётся к «выбранным», они на месте', () => {
    expect(scopeWithMode({ mode: 'selected', classIds: ['c2'] }, CLASSES, 'all')).toEqual(
      {
        mode: 'all',
        classIds: ['c2'],
      },
    );
  });

  it('смена режима на «выбранные» берёт сохранённые галочки без устаревших', () => {
    expect(
      scopeWithMode({ mode: 'all', classIds: ['c1', 'gone'] }, CLASSES, 'selected'),
    ).toEqual({ mode: 'selected', classIds: ['c1'] });
  });
});
