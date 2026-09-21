// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { attemptsExceededMessage } from './attempts-exceeded-message';

describe('attemptsExceededMessage', () => {
  it('одна попытка — «попытку»', () => {
    expect(attemptsExceededMessage(1)).toContain('1 попытку');
  });

  it('несколько попыток — «попытки»', () => {
    expect(attemptsExceededMessage(3)).toContain('3 попытки');
  });

  it('много попыток — «попыток»', () => {
    expect(attemptsExceededMessage(5)).toContain('5 попыток');
  });

  // Решение владельца 2026-09-21: просить учителя ученику незачем — открыть
  // попытку адресно всё равно нечем.
  it('не отсылает к учителю', () => {
    expect(attemptsExceededMessage(1)).not.toContain('учител');
  });
});
