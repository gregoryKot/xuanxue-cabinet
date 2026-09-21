// Чистая логика (CLAUDE.md «Тесты»): без Mongo и без DI. Сценарий с реальной
// Mongo (мок-последовательность findOneAndUpdate → null, затем реальное
// перечитывание) — в exam-attempts.service.spec.ts, вместе с самим submit().
import { resolveSubmitRaceOutcome } from './exam-attempt-submit-outcome';

describe('resolveSubmitRaceOutcome', () => {
  it('expired: true — дедлайн, а не гонка с другой вкладкой', () => {
    expect(resolveSubmitRaceOutcome({ expired: true })).toBe('expired');
  });

  it('expired: false — сдала другая вкладка того же ученика раньше нас', () => {
    expect(resolveSubmitRaceOutcome({ expired: false })).toBe('already-submitted');
  });
});
