// Чистая логика — юнит-тест без Mongo и без DI (CLAUDE.md «Тесты»).
import { applyOverrides } from './apply-overrides';

describe('applyOverrides', () => {
  it('без overrides — возвращает дефолт как есть', () => {
    expect(applyOverrides(['exam_result', 'post_draft'], [])).toEqual([
      'exam_result',
      'post_draft',
    ]);
  });

  it('enabled:false убирает вид из дефолта', () => {
    expect(
      applyOverrides(
        ['exam_result', 'post_draft'],
        [{ kind: 'post_draft', enabled: false }],
      ),
    ).toEqual(['exam_result']);
  });

  it('enabled:true добавляет вид, которого не было в дефолте', () => {
    expect(
      applyOverrides(['exam_result'], [{ kind: 'delivery_failed', enabled: true }]),
    ).toEqual(['exam_result', 'delivery_failed']);
  });

  it('результат — в каноническом порядке NOTIFICATION_KINDS, не в порядке overrides', () => {
    expect(
      applyOverrides(
        [],
        [
          { kind: 'payments', enabled: true },
          { kind: 'exam_result', enabled: true },
        ],
      ),
    ).toEqual(['exam_result', 'payments']);
  });

  it('повторный override того же вида — последний побеждает', () => {
    expect(
      applyOverrides(
        ['exam_result'],
        [
          { kind: 'exam_result', enabled: false },
          { kind: 'exam_result', enabled: true },
        ],
      ),
    ).toEqual(['exam_result']);
  });
});
