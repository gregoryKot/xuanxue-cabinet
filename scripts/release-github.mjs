// Обращения release-pick.mjs к GitHub REST: статус CI коммита и пауза выката
// (issue с меткой release-hold, ADR-0142). Вынесены, чтобы release-pick.mjs не
// рос за храповик размера; сеть юнитами не тестируется, как и в release-pick.
async function githubJson(path) {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`GitHub API ${path}: HTTP ${res.status}`);
  return res.json();
}

/** conclusion последнего прогона CI по коммиту → 'success'|'failure'|
 * 'cancelled'|'pending'|'none' (прогона ещё не было). */
export async function ciStatusFor(sha) {
  const data = await githubJson(
    `/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=1`,
  );
  const run = data.workflow_runs?.[0];
  if (!run) return 'none';
  if (run.status !== 'completed') return 'pending';
  if (run.conclusion === 'success') return 'success';
  if (run.conclusion === 'cancelled') return 'cancelled';
  return 'failure';
}

export async function holdReason() {
  const issues = await githubJson('/issues?labels=release-hold&state=open');
  if (!issues || issues.length === 0) return null;
  return `выкат на паузе: открыт issue #${issues[0].number}`;
}
