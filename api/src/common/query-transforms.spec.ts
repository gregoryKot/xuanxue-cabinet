import { booleanFromQuery } from './query-transforms';

describe('booleanFromQuery', () => {
  it("'true' → true", () => {
    expect(booleanFromQuery('true')).toBe(true);
  });

  it("'false' → false", () => {
    expect(booleanFromQuery('false')).toBe(false);
  });

  it('прочее не трогает — дальше решает @IsBoolean()', () => {
    expect(booleanFromQuery('yes')).toBe('yes');
    expect(booleanFromQuery(undefined)).toBeUndefined();
    expect(booleanFromQuery(true)).toBe(true);
  });
});
