import type { LessonScope } from '@xuanxue/shared';
import { recipientsInScope } from './recipients-in-scope';

const RECIPIENTS = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];

describe('recipientsInScope', () => {
  it('у кого выбора нет в карте — получает занятие, как до ADR-0162', () => {
    expect(recipientsInScope(RECIPIENTS, new Map(), 'c1')).toEqual(RECIPIENTS);
  });

  it('«все» и «выбранные с этим занятием» получают, «выбранные без него» — нет', () => {
    const scopes = new Map<string, LessonScope>([
      ['u1', { mode: 'all', classIds: [] }],
      ['u2', { mode: 'selected', classIds: ['c1'] }],
      ['u3', { mode: 'selected', classIds: ['c2'] }],
    ]);

    expect(recipientsInScope(RECIPIENTS, scopes, 'c1')).toEqual([
      { id: 'u1' },
      { id: 'u2' },
    ]);
  });

  it('«выбранные» без галочек не получают ничего', () => {
    const scopes = new Map<string, LessonScope>([
      ['u1', { mode: 'selected', classIds: [] }],
    ]);

    expect(recipientsInScope([{ id: 'u1' }], scopes, 'c1')).toEqual([]);
  });

  it('остальные поля получателя сохраняются', () => {
    const scopes = new Map<string, LessonScope>();

    expect(recipientsInScope([{ id: 'u1', name: 'Ваня' }], scopes, 'c1')).toEqual([
      { id: 'u1', name: 'Ваня' },
    ]);
  });
});
