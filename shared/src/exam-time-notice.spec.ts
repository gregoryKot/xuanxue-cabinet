// Отзыв владельца 2026-09-22: предупреждение перед стартом попытки должно
// называть срок словами formatDurationRu (не своим числом) и обе половины
// сути — что отсчёт уже пошёл и что просрочку закроет сам сервер, а не
// молчаливо оставит попытку висеть. Утверждения на конкретный текст, без
// снапшота: снапшот пропустит, если из фразы исчезнет именно смысл, а не
// форматирование.
import { describe, expect, it } from 'vitest';
import {
  buildExamRetryDeleteWarning,
  buildExamStartWarning,
  EXAM_RETRY_DELETE_FACT,
} from './exam-time-notice';

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

// Отзыв тестировщицы 2026-09-23, п.4; решение владельца — ADR-0131.
describe('buildExamRetryDeleteWarning', () => {
  it('без маркера ** (CLAUDE.md «Акценты» — жирным только web/, не shared/)', () => {
    expect(buildExamRetryDeleteWarning(45)).not.toContain('**');
    expect(buildExamRetryDeleteWarning(undefined)).not.toContain('**');
  });

  it('называет сам факт удаления', () => {
    expect(buildExamRetryDeleteWarning(45)).toContain(EXAM_RETRY_DELETE_FACT);
  });

  it('без лимита времени — тот же факт, без части про часы', () => {
    const message = buildExamRetryDeleteWarning(undefined);
    expect(message).toContain(EXAM_RETRY_DELETE_FACT);
    expect(message).not.toContain('Отсчёт пойдёт сразу');
  });

  it('с лимитом времени — добавляет ту же часть, что buildExamStartWarning', () => {
    const message = buildExamRetryDeleteWarning(45);
    expect(message).toContain('45 минут');
    expect(message).toContain('Отсчёт пойдёт сразу');
  });
});
