// Чистая работа с локальным черновиком ответов попытки (аудит 2026-09-21,
// MED «потеря ответа ученика») — без React и без сети: слияние с серверным
// снимком, частичное и полное снятие записи.
import { afterEach, describe, expect, it } from 'vitest';
import type { AttemptAnswerDto } from '@xuanxue/shared';
import {
  bootstrapAttemptAnswers,
  clearAttemptDraft,
  forgetSavedAnswers,
  writeAttemptAnswerDraft,
} from './attemptLocalDraft';

const ATTEMPT_ID = 'attempt-1';

afterEach(() => {
  localStorage.clear();
});

describe('bootstrapAttemptAnswers', () => {
  it('черновика нет — серверный снимок как есть, восстановленных нет', () => {
    const server: AttemptAnswerDto[] = [{ itemId: 'q1', text: 'ответ' }];

    const result = bootstrapAttemptAnswers(ATTEMPT_ID, server);

    expect(result.answers.get('q1')).toEqual({ itemId: 'q1', text: 'ответ' });
    expect(result.recoveredIds).toEqual([]);
  });

  it('черновик отличается от сервера — накладывается поверх и помечается dirty', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q1', text: 'дописал офлайн' });
    const server: AttemptAnswerDto[] = [{ itemId: 'q1', text: 'начал вчера' }];

    const result = bootstrapAttemptAnswers(ATTEMPT_ID, server);

    expect(result.answers.get('q1')).toEqual({ itemId: 'q1', text: 'дописал офлайн' });
    expect(result.recoveredIds).toEqual(['q1']);
  });

  it('черновик совпадает с сервером — не восстановленный (сохранять нечего)', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q1', text: 'ответ' });
    const server: AttemptAnswerDto[] = [{ itemId: 'q1', text: 'ответ' }];

    const result = bootstrapAttemptAnswers(ATTEMPT_ID, server);

    expect(result.recoveredIds).toEqual([]);
  });

  it('черновик про вопрос, которого нет в серверном снимке, — добавляется', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q2', optionIds: ['a'] });
    const server: AttemptAnswerDto[] = [{ itemId: 'q1', text: 'ответ' }];

    const result = bootstrapAttemptAnswers(ATTEMPT_ID, server);

    expect(result.answers.get('q2')).toEqual({ itemId: 'q2', optionIds: ['a'] });
    expect(result.recoveredIds).toEqual(['q2']);
  });

  it('черновик одной попытки не виден в другой', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q1', text: 'чужой черновик' });

    const result = bootstrapAttemptAnswers('attempt-2', []);

    expect(result.answers.size).toBe(0);
    expect(result.recoveredIds).toEqual([]);
  });
});

describe('forgetSavedAnswers', () => {
  it('снимает только сохранённые ответы, остальные dirty остаются', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q1', text: 'первый' });
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q2', text: 'второй' });

    forgetSavedAnswers(ATTEMPT_ID, ['q1']);

    const result = bootstrapAttemptAnswers(ATTEMPT_ID, []);
    expect(result.answers.get('q1')).toBeUndefined();
    expect(result.answers.get('q2')).toEqual({ itemId: 'q2', text: 'второй' });
  });

  it('сняты все ответы — ключ убирается целиком, не висит пустым объектом', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q1', text: 'ответ' });

    forgetSavedAnswers(ATTEMPT_ID, ['q1']);

    expect(localStorage.getItem('xuanxue.draft.attempt:attempt-1')).toBeNull();
  });
});

describe('clearAttemptDraft', () => {
  it('убирает черновик целиком независимо от количества ответов', () => {
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q1', text: 'первый' });
    writeAttemptAnswerDraft(ATTEMPT_ID, { itemId: 'q2', text: 'второй' });

    clearAttemptDraft(ATTEMPT_ID);

    expect(localStorage.getItem('xuanxue.draft.attempt:attempt-1')).toBeNull();
  });
});
