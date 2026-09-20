import { describe, expect, it } from 'vitest';
import { WEEKDAY_LABELS_RU } from './domain';

describe('WEEKDAY_LABELS_RU', () => {
  it('содержит все семь дней недели', () => {
    expect(Object.keys(WEEKDAY_LABELS_RU)).toHaveLength(7);
  });

  it('день 0 — воскресенье, неделя начинается с него', () => {
    expect(WEEKDAY_LABELS_RU[0]).toBe('Вс');
  });
});
