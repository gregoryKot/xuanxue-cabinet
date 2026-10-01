import { describe, expect, it } from 'vitest';
import { defaultNotifications, NOTIFICATION_KINDS } from './notifications';
import {
  effectiveReminderMinutes,
  hasLessonScopedKinds,
  isLessonInScope,
  LESSON_REMINDER_CHOICES,
  LESSON_SCOPE_MODES,
  LESSON_SCOPED_KINDS,
} from './lesson-notifications';

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

describe('effectiveReminderMinutes', () => {
  it('свой выбор человека важнее школьного значения', () => {
    expect(effectiveReminderMinutes(15, 60)).toBe(15);
    expect(effectiveReminderMinutes(120, 30)).toBe(120);
  });

  it('не выбирал (нет поля или null) — значение школы', () => {
    expect(effectiveReminderMinutes(undefined, 45)).toBe(45);
    expect(effectiveReminderMinutes(null, 45)).toBe(45);
  });

  it('школьное значение не обязано быть из списка: его задаёт учитель числом', () => {
    expect(LESSON_REMINDER_CHOICES).not.toContain(45);
    expect(effectiveReminderMinutes(null, 45)).toBe(45);
  });
});

describe('LESSON_REMINDER_CHOICES', () => {
  it('четыре пункта по возрастанию: от «успеть подключиться» до «успеть доехать»', () => {
    expect(LESSON_REMINDER_CHOICES).toEqual([15, 30, 60, 120]);
  });
});

describe('hasLessonScopedKinds', () => {
  it('ученик — «Занятие скоро» у него есть, выбор занятий нужен', () => {
    expect(hasLessonScopedKinds(defaultNotifications([]))).toBe(true);
  });

  it.each(['teacher', 'assistant', 'admin', 'accountant'] as const)(
    'штат (%s) — видов про занятие нет, выбор не показывается',
    (role) => {
      expect(hasLessonScopedKinds(defaultNotifications([role]))).toBe(false);
    },
  );

  it('пустой список — выбирать не из чего', () => {
    expect(hasLessonScopedKinds([])).toBe(false);
  });

  // ADR-0162: отмену, запись и материал тик сверяет с выбором человека
  // (isLessonInScope), поэтому они в списке видов, которые выбор фильтрует.
  it('виды про занятие и материал подчиняются выбору, остальные виды — нет', () => {
    expect(LESSON_SCOPED_KINDS).toEqual([
      'lesson_soon',
      'lesson_cancelled',
      'recording_ready',
      'material_new',
    ]);
    expect(hasLessonScopedKinds(['lesson_cancelled'])).toBe(true);
    expect(hasLessonScopedKinds(['recording_ready'])).toBe(true);
    expect(hasLessonScopedKinds(['material_new'])).toBe(true);
    expect(hasLessonScopedKinds(['exam_result', 'payment_due'])).toBe(false);
  });

  it('каждый вид «про занятие» — настоящий вид уведомления', () => {
    for (const kind of LESSON_SCOPED_KINDS) {
      expect(NOTIFICATION_KINDS).toContain(kind);
    }
  });
});
