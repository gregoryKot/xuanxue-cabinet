import { describe, expect, it } from 'vitest';
import { KEEPALIVE_BODY_MAX_BYTES } from '../api/http';
import { keepaliveFor } from './attemptSaveKeepalive';

// Аудит 2026-10-01, F43: порог — в байтах JSON, не в знаках (кириллица — два
// байта на знак), иначе большой черновик уронил бы fetch с TypeError.
describe('keepaliveFor', () => {
  it('не просили — undefined, запрос уходит как раньше', () => {
    expect(keepaliveFor({ answers: [] }, undefined)).toBeUndefined();
    expect(keepaliveFor({ answers: [] }, false)).toBeUndefined();
  });

  it('просили и тело маленькое — true', () => {
    expect(keepaliveFor({ answers: [{ itemId: 'i1', text: 'ответ' }] }, true)).toBe(true);
  });

  it('просили, но тело больше потолка в байтах — undefined', () => {
    // Знаков меньше потолка, байтов — больше: считать надо байты.
    const text = 'ж'.repeat(KEEPALIVE_BODY_MAX_BYTES / 2 + 1);
    expect(text.length).toBeLessThan(KEEPALIVE_BODY_MAX_BYTES);
    expect(keepaliveFor({ answers: [{ itemId: 'i1', text }] }, true)).toBeUndefined();
  });
});
