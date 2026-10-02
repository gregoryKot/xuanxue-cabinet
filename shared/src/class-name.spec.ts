import { describe, expect, it } from 'vitest';
import { classDisplayName } from './class-name';

describe('classDisplayName', () => {
  it('название и группа через точку — тёзки различимы', () => {
    expect(classDisplayName({ title: 'Тайцзицюань', groupLabel: 'средняя группа' })).toBe(
      'Тайцзицюань · средняя группа',
    );
  });

  it('без группы, с пустой или пробельной группой — одно название', () => {
    expect(classDisplayName({ title: 'Нейгун' })).toBe('Нейгун');
    expect(classDisplayName({ title: 'Нейгун', groupLabel: '' })).toBe('Нейгун');
    expect(classDisplayName({ title: 'Нейгун', groupLabel: '  ' })).toBe('Нейгун');
  });
});
