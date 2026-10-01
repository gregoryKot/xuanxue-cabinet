// Правка выбора «о каких занятиях» (lessonScopeEdit.ts): из текущего выбора и
// клика получается тело PUT. Чистая логика, без React и сети.
import { describe, expect, it } from 'vitest';
import type { LessonScopeClassDto } from '@xuanxue/shared';
import {
  hasNoTicks,
  scopeWithMode,
  scopeWithTick,
  tickedClassIds,
} from './lessonScopeEdit';

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

describe('scopeWithTick', () => {
  it('новая галочка встаёт в порядок списка', () => {
    expect(
      scopeWithTick({ mode: 'selected', classIds: ['c3'] }, CLASSES, 'c1', true),
    ).toEqual({ mode: 'selected', classIds: ['c1', 'c3'] });
  });

  it('снятая галочка уходит, остальные остаются', () => {
    expect(
      scopeWithTick({ mode: 'selected', classIds: ['c1', 'c2'] }, CLASSES, 'c1', false),
    ).toEqual({ mode: 'selected', classIds: ['c2'] });
  });

  it('вторая такая же галочка ничего не дублирует', () => {
    expect(
      scopeWithTick({ mode: 'selected', classIds: ['c1'] }, CLASSES, 'c1', true),
    ).toEqual({ mode: 'selected', classIds: ['c1'] });
  });

  it('устаревший id в выборе в тело не попадает', () => {
    expect(
      scopeWithTick({ mode: 'selected', classIds: ['gone'] }, CLASSES, 'c2', true),
    ).toEqual({ mode: 'selected', classIds: ['c2'] });
  });

  it('режим выбора не меняется', () => {
    expect(scopeWithTick({ mode: 'all', classIds: [] }, CLASSES, 'c1', true).mode).toBe(
      'all',
    );
  });
});

describe('hasNoTicks', () => {
  it('«выбранные» без галочек — ни о каких', () => {
    expect(hasNoTicks({ mode: 'selected', classIds: [] }, CLASSES)).toBe(true);
  });

  it('«выбранные» только с устаревшим id — тоже ни о каких: его занятия в списке нет', () => {
    expect(hasNoTicks({ mode: 'selected', classIds: ['gone'] }, CLASSES)).toBe(true);
  });

  it('«выбранные» с галочкой — есть о чём напоминать', () => {
    expect(hasNoTicks({ mode: 'selected', classIds: ['c2'] }, CLASSES)).toBe(false);
  });

  it('«все» — пустой список галочек ничего не значит', () => {
    expect(hasNoTicks({ mode: 'all', classIds: [] }, CLASSES)).toBe(false);
  });
});
