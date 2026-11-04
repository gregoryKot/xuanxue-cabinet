import { describe, expect, it } from 'vitest';
import {
  groupBlockedText,
  groupClassCountText,
  groupMetaText,
  groupsSummaryText,
} from './groupsText';

describe('groupClassCountText', () => {
  it('склоняет число занятий по-русски, включая 11–14 и 21', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25].map(groupClassCountText)).toEqual([
      '1 занятие',
      '2 занятия',
      '5 занятий',
      '11 занятий',
      '12 занятий',
      '21 занятие',
      '22 занятия',
      '25 занятий',
    ]);
  });

  it('у группы без занятий — «Занятий нет», а не «0 занятий»', () => {
    expect(groupClassCountText(0)).toBe('Занятий нет');
  });
});

describe('groupsSummaryText', () => {
  it('число групп выделено акцентом', () => {
    expect(groupsSummaryText(3)).toBe('Групп: **3**');
  });

  it('пустая школа — честное «Групп пока нет», не «0» и не NaN', () => {
    expect(groupsSummaryText(0)).toBe('Групп пока нет');
  });
});

describe('groupMetaText', () => {
  it('занятия и названия каналов группы через запятую', () => {
    expect(
      groupMetaText({ classCount: 5, channelCount: 2 }, ['Тайцзи вечер', 'Ученики ВК']),
    ).toBe('5 занятий · каналы: Тайцзи вечер, Ученики ВК');
  });

  it('у группы нет канала — «канала нет», у пустой группы тоже честно', () => {
    expect(groupMetaText({ classCount: 5, channelCount: 0 }, [])).toBe(
      '5 занятий · канала нет',
    );
    expect(groupMetaText({ classCount: 0, channelCount: 0 }, [])).toBe(
      'Занятий нет · канала нет',
    );
  });

  it('список каналов ещё не пришёл — число из самой группы, а не «канала нет»', () => {
    expect(groupMetaText({ classCount: 1, channelCount: 3 }, null)).toBe(
      '1 занятие · каналов: 3',
    );
    expect(groupMetaText({ classCount: 1, channelCount: 0 }, null)).toBe(
      '1 занятие · канала нет',
    );
  });
});

describe('groupBlockedText', () => {
  it('называет, что держит группу: занятия, каналы или оба', () => {
    expect(groupBlockedText({ classCount: 2, channelCount: 0 })).toBe(
      'Удалить нельзя: есть занятия',
    );
    expect(groupBlockedText({ classCount: 0, channelCount: 1 })).toBe(
      'Удалить нельзя: есть каналы',
    );
    expect(groupBlockedText({ classCount: 1, channelCount: 1 })).toBe(
      'Удалить нельзя: есть занятия и каналы',
    );
  });

  it('группа свободна — пустая строка, удалять можно', () => {
    expect(groupBlockedText({ classCount: 0, channelCount: 0 })).toBe('');
  });
});
