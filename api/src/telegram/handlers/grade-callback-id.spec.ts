// Чистая логика, без Mongo и DI (CLAUDE.md «Тесты»).
import { buildGradeButtonId, parseGradeButtonId } from './grade-callback-id';

const ATTEMPT_ID = '507f1f77bcf86cd799439011';

describe('buildGradeButtonId/parseGradeButtonId', () => {
  it('строит и разбирает составной id обратно', () => {
    const id = buildGradeButtonId(ATTEMPT_ID, 'passed');
    expect(parseGradeButtonId(id)).toEqual({ attemptId: ATTEMPT_ID, outcome: 'passed' });
  });

  it('битый attemptId — null, не бросает', () => {
    expect(parseGradeButtonId(`не-id:passed`)).toBeNull();
  });

  it('незнакомый outcome — null (чужая/битая кнопка)', () => {
    expect(parseGradeButtonId(`${ATTEMPT_ID}:excellent`)).toBeNull();
  });

  it('без разделителя — null', () => {
    expect(parseGradeButtonId(ATTEMPT_ID)).toBeNull();
  });
});
