// Юнит, без Mongo и DI (CLAUDE.md «Тесты», «Чистая логика») — ветвления
// нормализации статуса, включая предупреждение в лог (ADR-0035).
import { Logger } from '@nestjs/common';
import { normalizeUserStatus } from './normalize-user-status';

describe('normalizeUserStatus', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('active возвращается как есть, без предупреждения', () => {
    expect(normalizeUserStatus('active', 'u1')).toBe('active');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('blocked возвращается как есть, без предупреждения', () => {
    expect(normalizeUserStatus('blocked', 'u1')).toBe('blocked');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("'invited' → 'active' с одним предупреждением, содержащим статус и userId", () => {
    const result = normalizeUserStatus('invited', '507f1f77bcf86cd799439011');

    expect(result).toBe('active');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain('invited');
    expect(message).toContain('507f1f77bcf86cd799439011');
  });

  it('undefined → active с предупреждением', () => {
    expect(normalizeUserStatus(undefined, 'u2')).toBe('active');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('пустая строка → active с предупреждением', () => {
    expect(normalizeUserStatus('', 'u3')).toBe('active');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('число → active с предупреждением', () => {
    expect(normalizeUserStatus(1, 'u4')).toBe('active');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
