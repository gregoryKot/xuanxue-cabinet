// Чистая функция без Nest (CLAUDE.md «Любой код с логикой приезжает с
// тестом» — уровень «чистая логика»): короткий SHA для /api/health.
// RAILWAY_GIT_COMMIT_SHA — Railway ставит её сама при сборке образа, локально
// и в обычном docker-смоке CI её нет — тогда commit в ответе отсутствует
// (RUNBOOK §2 п.1 сверяет его только там, где переменная задана).
const SHORT_SHA_LENGTH = 7;

export function shortCommitSha(fullSha: string | undefined): string | undefined {
  if (!fullSha) return undefined;
  return fullSha.slice(0, SHORT_SHA_LENGTH);
}
