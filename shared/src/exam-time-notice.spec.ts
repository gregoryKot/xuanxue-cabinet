// Отзыв владельца 2026-09-22: предупреждение перед стартом попытки должно
// называть срок словами formatDurationRu (не своим числом) и обе половины
// сути — что отсчёт уже пошёл и что просрочку закроет сам сервер, а не
// молчаливо оставит попытку висеть. Утверждения на конкретный текст, без
// снапшота: снапшот пропустит, если из фразы исчезнет именно смысл, а не
// форматирование.
import { describe, expect, it } from 'vitest';
import { buildExamStartWarning } from './exam-time-notice';

describe('buildExamStartWarning', () => {
  it('45 минут — через formatDurationRu, минутами', () => {
    expect(buildExamStartWarning(45)).toContain('45 минут');
  });

  it('60 минут — через formatDurationRu, часом, не минутами', () => {
    expect(buildExamStartWarning(60)).toContain('1 час');
  });

  it('называет, что отсчёт пойдёт сразу', () => {
    expect(buildExamStartWarning(45)).toContain('Отсчёт пойдёт сразу');
  });

  it('называет, что попытка закроется сама по истечении времени', () => {
    expect(buildExamStartWarning(45)).toContain('попытка закроется сама');
  });
});
