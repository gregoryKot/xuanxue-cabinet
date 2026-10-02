import { describe, expect, it } from 'vitest';
import type { ClassFormat } from '@xuanxue/shared';
import { slotPlaceParts } from './slotPlace';

describe('slotPlaceParts', () => {
  it('онлайн — одна часть «Онлайн», адрес игнорируется', () => {
    expect(slotPlaceParts('online')).toEqual([{ kind: 'online', text: 'Онлайн' }]);
    expect(slotPlaceParts('online', 'Аркави 3, Тель-Авив')).toEqual([
      { kind: 'online', text: 'Онлайн' },
    ]);
  });

  it('офлайн с адресом — одна часть: адрес', () => {
    expect(slotPlaceParts('offline', 'Парк Яркон')).toEqual([
      { kind: 'venue', text: 'Парк Яркон' },
    ]);
  });

  it('офлайн без адреса — слово формата «Офлайн»', () => {
    expect(slotPlaceParts('offline')).toEqual([{ kind: 'venue', text: 'Офлайн' }]);
  });

  it.each(['', '   ', '\t\n'])(
    'офлайн с пустым или пробельным адресом %j — «Офлайн», не пустота',
    (location) => {
      expect(slotPlaceParts('offline', location)).toEqual([
        { kind: 'venue', text: 'Офлайн' },
      ]);
    },
  );

  it('адрес обрезается по краям пробелов', () => {
    expect(slotPlaceParts('offline', '  Аркави 3  ')).toEqual([
      { kind: 'venue', text: 'Аркави 3' },
    ]);
  });

  it('и то и другое — адрес и «и онлайн» двумя частями, в этом порядке', () => {
    expect(slotPlaceParts('both', 'Аркави 3, Тель-Авив')).toEqual([
      { kind: 'venue', text: 'Аркави 3, Тель-Авив' },
      { kind: 'online', text: 'и онлайн' },
    ]);
  });

  it('и то и другое без адреса — «Офлайн» и «и онлайн»', () => {
    expect(slotPlaceParts('both', '  ')).toEqual([
      { kind: 'venue', text: 'Офлайн' },
      { kind: 'online', text: 'и онлайн' },
    ]);
  });

  it('у каждой части свой kind — по нему SlotRow выбирает значок и ключ списка', () => {
    const formats: ClassFormat[] = ['online', 'offline', 'both'];

    for (const format of formats) {
      const kinds = slotPlaceParts(format, 'Аркави 3').map((part) => part.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });
});
