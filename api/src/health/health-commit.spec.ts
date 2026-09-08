import { shortCommitSha } from './health-commit';

describe('shortCommitSha', () => {
  it('полный SHA — первые 7 символов', () => {
    expect(shortCommitSha('a1b2c3d4e5f6789')).toBe('a1b2c3d');
  });

  it('переменная не задана (локально, docker-смок без RAILWAY_GIT_COMMIT_SHA) — undefined', () => {
    expect(shortCommitSha(undefined)).toBeUndefined();
  });

  it('пустая строка — тоже undefined, не пустой commit в ответе', () => {
    expect(shortCommitSha('')).toBeUndefined();
  });
});
