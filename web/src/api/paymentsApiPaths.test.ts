import { describe, expect, it } from 'vitest';
import {
  paymentScreenshotSrc,
  paymentsListPath,
  paymentsQuery,
} from './paymentsApiPaths';

describe('paymentsListPath', () => {
  it('без месяца — только лимит: месяц называет сервер', () => {
    expect(paymentsListPath(null)).toBe('/payments?limit=200');
  });

  it('с месяцем — month и лимит', () => {
    expect(paymentsListPath('2026-08')).toBe('/payments?month=2026-08&limit=200');
  });
});

describe('paymentsQuery', () => {
  it('без месяца поля month нет вовсе — сервер не получит пустую строку', () => {
    expect(paymentsQuery(null)).toEqual({ limit: 200 });
  });
});

describe('адрес снимка', () => {
  it('адрес снимка для <img> — с префиксом /api', () => {
    expect(paymentScreenshotSrc('u1', '2026-09')).toBe(
      '/api/payments/u1/2026-09/screenshot',
    );
  });
});
