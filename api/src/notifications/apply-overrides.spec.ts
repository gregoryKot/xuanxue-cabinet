// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import { applyOverrides } from './apply-overrides';

describe('applyOverrides', () => {
  it('без overrides — возвращает дефолт как есть', () => {
    expect(applyOverrides(['lesson_soon', 'teacher_message'], [])).toEqual([
      'lesson_soon',
      'teacher_message',
    ]);
  });

  it('enabled:false убирает вид из дефолта', () => {
    expect(
      applyOverrides(
        ['lesson_soon', 'teacher_message'],
        [{ kind: 'teacher_message', enabled: false }],
      ),
    ).toEqual(['lesson_soon']);
  });

  it('enabled:true добавляет вид, которого не было в дефолте', () => {
    expect(
      applyOverrides(['lesson_soon'], [{ kind: 'delivery_failed', enabled: true }]),
    ).toEqual(['lesson_soon', 'delivery_failed']);
  });

  it('результат — в каноническом порядке NOTIFICATION_KINDS, не в порядке overrides', () => {
    expect(
      applyOverrides(
        [],
        [
          { kind: 'payments', enabled: true },
          { kind: 'lesson_soon', enabled: true },
        ],
      ),
    ).toEqual(['lesson_soon', 'payments']);
  });

  it('повторный override того же вида — последний побеждает', () => {
    expect(
      applyOverrides(
        ['lesson_soon'],
        [
          { kind: 'lesson_soon', enabled: false },
          { kind: 'lesson_soon', enabled: true },
        ],
      ),
    ).toEqual(['lesson_soon']);
  });
});
