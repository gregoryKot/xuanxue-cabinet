import { describe, expect, it } from 'vitest';
import { MY_LESSONS_PATH, SETTINGS_PATH } from '../api/apiPaths';
import { MY_BOARD_PATH } from '../api/boardApiPaths';
import { MY_EVENTS_PATH, SCHOOL_EVENTS_PATH } from '../api/eventsApiPaths';
import { GRADING_QUEUE_PATH } from '../api/gradingPaths';
import { MY_PAYMENTS_PATH } from '../api/paymentsApiPaths';
import { makeMe } from '../test-support/meFixture';
import { hiddenTilePaths } from './hiddenTilePaths';

describe('hiddenTilePaths', () => {
  it('ничего не скрыто — путей нет', () => {
    expect(hiddenTilePaths(makeMe())).toEqual([]);
  });

  it('ученик: каждой скрытой плитке — её запрос, экзаменам — никакого', () => {
    const me = makeMe({
      homeHiddenTiles: ['nextLesson', 'notice', 'exams', 'payment', 'events'],
    });

    expect(hiddenTilePaths(me).sort()).toEqual(
      [MY_LESSONS_PATH, MY_BOARD_PATH, MY_PAYMENTS_PATH, MY_EVENTS_PATH].sort(),
    );
  });

  it('штат: объявление, проверка и события — свои запросы штата', () => {
    const me = makeMe({
      roles: ['teacher'],
      homeHiddenTiles: ['notice', 'grading', 'events'],
    });

    expect(hiddenTilePaths(me).sort()).toEqual(
      [SETTINGS_PATH, GRADING_QUEUE_PATH, SCHOOL_EVENTS_PATH].sort(),
    );
  });

  it('штат в режиме ученика: ключи ученика, а ключ проверки ничего не отменяет', () => {
    const me = makeMe({
      roles: [],
      studentMode: true,
      canUseStudentMode: true,
      homeHiddenTiles: ['grading', 'payment'],
    });

    expect(hiddenTilePaths(me)).toEqual([MY_PAYMENTS_PATH]);
  });
});
