// Правила занятия одной строкой (lib/classSlotsLabel.ts): чистая склейка, без
// пояса и без «сейчас» — время остаётся школьным (ADR-0162).
import { describe, expect, it } from 'vitest';
import { classNamesById, classOptionLabel, classSlotsLabel } from './classSlotsLabel';

const slot = (weekday: number, time: string) => ({ weekday, time, durationMin: 60 });

describe('classSlotsLabel', () => {
  it('дни с одним временем склеены через запятую: «вс, ср · 08:00»', () => {
    expect(classSlotsLabel([slot(3, '08:00'), slot(0, '08:00')])).toBe('вс, ср · 08:00');
  });

  it('порядок дней как в сетке «Расписания»: неделя с воскресенья', () => {
    expect(classSlotsLabel([slot(1, '10:00'), slot(0, '10:00'), slot(6, '10:00')])).toBe(
      'вс, пн, сб · 10:00',
    );
  });

  it('разное время — отдельные части через «; », по возрастанию времени', () => {
    expect(classSlotsLabel([slot(3, '19:00'), slot(1, '08:00'), slot(5, '08:00')])).toBe(
      'пн, пт · 08:00; ср · 19:00',
    );
  });

  it('два занятия в один день — день назван дважды', () => {
    expect(classSlotsLabel([slot(1, '19:00'), slot(1, '10:00')])).toBe(
      'пн · 10:00; пн · 19:00',
    );
  });

  it('одинаковые правила не повторяются', () => {
    expect(classSlotsLabel([slot(1, '10:00'), slot(1, '10:00')])).toBe('пн · 10:00');
  });

  it('полночь и продолжительность: время как пришло, длительность в подпись не попадает', () => {
    expect(classSlotsLabel([{ weekday: 2, time: '00:00', durationMin: 90 }])).toBe(
      'вт · 00:00',
    );
  });

  it('правил нет — пустая строка', () => {
    expect(classSlotsLabel([])).toBe('');
  });
});

describe('classOptionLabel', () => {
  it('название с группой и дни — тёзки в списке выбора различимы', () => {
    expect(
      classOptionLabel({
        title: 'Тайцзицюань',
        groupLabel: 'средняя группа',
        rules: [slot(1, '10:00'), slot(2, '10:00')],
      }),
    ).toBe('Тайцзицюань · средняя группа (пн, вт · 10:00)');
  });

  it('правил нет — только название, без пустых скобок', () => {
    expect(classOptionLabel({ title: 'Нейгун', groupLabel: '', rules: [] })).toBe(
      'Нейгун',
    );
  });
});

describe('classNamesById', () => {
  it('каждому id — название с группой', () => {
    const names = classNamesById(
      new Map([
        ['a', { title: 'Тайцзицюань', groupLabel: 'новички' }],
        ['b', { title: 'Нейгун', groupLabel: '' }],
      ]),
    );
    expect([...names]).toEqual([
      ['a', 'Тайцзицюань · новички'],
      ['b', 'Нейгун'],
    ]);
  });
});
