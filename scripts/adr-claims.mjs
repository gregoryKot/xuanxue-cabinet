#!/usr/bin/env node
// Заявка на номер ADR: кто занял номер, чей раньше и какой свободен.
//
// Отдельно от git-refs.mjs намеренно: там обёртки над git, которые ничего не
// знают про ADR и годятся любому будущему гейту; здесь — только правила
// нумерации. Всё, что ниже поиска заявок, — чистые функции без git и fs:
// adr-claims.test.mjs гоняет их на фикстурах.
//
// Зачем это вообще: 2026-09-22 номер 0106 заняли две сессии в разных ветках, и
// оба PR были зелёными поодиночке — гейт читал только рабочее дерево
// (ADR-0107).
import {
  commitTimeFor,
  fetchAllBranches,
  listRemoteBranches,
  runGit,
} from './git-refs.mjs';

const ADR_DIR = 'docs/adr';

/** Заявки ADR в дереве `ref`, что разбирает `parse`; `{ ok: false }` — ветка исчезла. */
export function collectAdrEntries(ref, parse, opts = {}) {
  const listed = runGit(['ls-tree', '-r', '--name-only', ref, '--', ADR_DIR], opts);
  if (!listed.ok) return { ok: false, error: listed.error };
  const paths = listed.stdout.split('\n').filter((l) => l.trim() !== '');
  const entries = [];
  for (const path of paths) {
    const file = path.slice(ADR_DIR.length + 1);
    const parsed = parse(file);
    if (!parsed) continue;
    const claimedAt = commitTimeFor(ref, path, opts) ?? 0;
    entries.push({ number: parsed.number, file, claimedAt });
  }
  return { ok: true, entries };
}

/** Заявки main, свои и чужих веток одним вызовом; `{ ok: false }` — сеть недоступна. */
export function collectCrossBranchAdrData(adrs, parse, opts = {}) {
  const fetched = fetchAllBranches(opts);
  if (!fetched.ok) return { ok: false, reason: fetched.error };
  const head = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], opts);
  const remote = listRemoteBranches(head.ok ? head.stdout.trim() : '', opts);
  if (!remote.ok) return { ok: false, reason: remote.error };
  const mainEntries = collectAdrEntries('origin/main', parse, opts);
  if (!mainEntries.ok) return { ok: false, reason: mainEntries.error };
  const mine = adrs.map(({ number, file }) => ({
    number,
    file,
    claimedAt: commitTimeFor('HEAD', `docs/adr/${file}`, opts) ?? Date.now() / 1000,
  }));
  const branches = [];
  for (const branch of remote.branches) {
    // Ветка исчезла между fetch и чтением (смёржили) — пропускаем только её.
    const found = collectAdrEntries(`origin/${branch}`, parse, opts);
    if (found.ok) branches.push({ branch, entries: found.entries });
  }
  return { ok: true, main: mainEntries.entries, mine, branches };
}

/** Новая (не в main) заявка совпала с чужой: тот же номер, другой файл; падает, если я позже.
 *
 * Одинаковое имя файла коллизией не считается не только из-за общей истории
 * веток: в CI пул-реквест выезжает detached HEAD, своя ветка не отличается от
 * чужих и попадает в сравнение сама с собой. Убрать это условие — значит
 * получить красный CI на каждом PR с новым ADR. */
export function findCrossBranchCollisions({ mine, main, branches }) {
  const inMain = new Set(main.map((a) => a.number));
  const isNew = (e) => !inMain.has(e.number);
  const myClaims = mine.filter(isNew);
  const theirClaims = branches.flatMap(({ branch, entries }) =>
    entries.filter(isNew).map((e) => ({ ...e, branch })),
  );
  const collisions = [];
  for (const my of myClaims) {
    for (const their of theirClaims) {
      if (my.number !== their.number || my.file === their.file) continue;
      collisions.push({
        number: my.number,
        myFile: my.file,
        theirFile: their.file,
        branch: their.branch,
        iClaimedLater: my.claimedAt > their.claimedAt,
      });
    }
  }
  return collisions;
}

/** Первый номер вида `0108`, не занятый ни в одном из перечисленных. */
export function firstFreeNumber(allNumbers) {
  const taken = new Set(allNumbers);
  let n = 1;
  while (taken.has(String(n).padStart(4, '0'))) n += 1;
  return String(n).padStart(4, '0');
}

/** Коллизия — в `problems` (падение) или в консоль (предупреждение), по `iClaimedLater`. */
export function reportCrossBranch(cross, problems) {
  if (!cross.ok) {
    console.log(`⚠️  чужие ветки не проверены: ${cross.reason}`);
    return;
  }
  const numbers = [cross.main, cross.mine, ...cross.branches.map((b) => b.entries)]
    .flat()
    .map((a) => a.number);
  const free = firstFreeNumber(numbers);
  for (const c of findCrossBranchCollisions(cross)) {
    const msg = `номер ${c.number} занят и в ветке ${c.branch}: docs/adr/${c.myFile} (у меня), docs/adr/${c.theirFile} (там) — свободен ${free}`;
    if (c.iClaimedLater) problems.push(`${msg}, я заявил позже`);
    else console.log(`⚠️  ${msg}, там заявили раньше — пусть ${c.branch} перенумерует`);
  }
  console.log(`✓ чужих веток проверено: ${cross.branches.length}`);
}
