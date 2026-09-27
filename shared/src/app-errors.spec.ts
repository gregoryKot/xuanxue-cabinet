import { describe, expect, it } from 'vitest';
import { APP_ERROR_KINDS } from './app-errors';
import { CLIENT_ERROR_KINDS } from './client-errors';

describe('APP_ERROR_KINDS', () => {
  // Новый вид отчёта браузера без строки здесь приехал бы в журнал видом,
  // которого экран «Сбои» не знает.
  it('включает каждый вид отчёта браузера и серверный вид', () => {
    expect(APP_ERROR_KINDS).toEqual([...CLIENT_ERROR_KINDS, 'server']);
  });
});
