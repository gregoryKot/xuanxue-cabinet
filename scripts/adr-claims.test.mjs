// Тесты правил нумерации ADR (scripts/adr-claims.mjs): фикстуры-структуры,
// без git и без сети — проверяется разбор заявок, а не сегодняшнее состояние
// веток. Гейт, у которого нет такого теста, «работает по памяти» ровно так
// же, как правило без гейта (ADR-0106, ADR-0107).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCrossBranchCollisions,
  findMainCollisions,
  firstFreeNumber,
} from './adr-claims.mjs';

test('findCrossBranchCollisions: одинаковый номер, разные файлы, я заявил позже — падение', () => {
  const mine = [{ number: '0107', file: '0107-my-decision.md', claimedAt: 200 }];
  const main = [];
  const branches = [
    {
      branch: 'their-branch',
      entries: [{ number: '0107', file: '0107-their-decision.md', claimedAt: 100 }],
    },
  ];
  assert.deepEqual(findCrossBranchCollisions({ mine, main, branches }), [
    {
      number: '0107',
      myFile: '0107-my-decision.md',
      theirFile: '0107-their-decision.md',
      branch: 'their-branch',
      iClaimedLater: true,
    },
  ]);
});

test('findCrossBranchCollisions: та же коллизия, я заявил раньше — предупреждение, не падение', () => {
  const mine = [{ number: '0107', file: '0107-my-decision.md', claimedAt: 100 }];
  const main = [];
  const branches = [
    {
      branch: 'their-branch',
      entries: [{ number: '0107', file: '0107-their-decision.md', claimedAt: 200 }],
    },
  ];
  const [collision] = findCrossBranchCollisions({ mine, main, branches });
  assert.equal(collision.iClaimedLater, false);
});

test('findCrossBranchCollisions: одинаковый номер и одинаковое имя файла — не коллизия', () => {
  const mine = [{ number: '0107', file: '0107-shared-decision.md', claimedAt: 100 }];
  const main = [];
  const branches = [
    {
      branch: 'their-branch',
      entries: [{ number: '0107', file: '0107-shared-decision.md', claimedAt: 200 }],
    },
  ];
  assert.deepEqual(findCrossBranchCollisions({ mine, main, branches }), []);
});

test('findCrossBranchCollisions: номер уже в main — устаревание ветки, не моя коллизия', () => {
  // Ключевой фильтр правила: номер, слитый в main (пусть и под другим именем
  // у меня и у чужой ветки), — не кросс-веточная коллизия, её и так ловит
  // findDuplicateNumbers (check-adr-numbers.mjs) после мержа.
  const mine = [{ number: '0059', file: '0059-my-unrelated-file.md', claimedAt: 100 }];
  const main = [{ number: '0059', file: '0059-lesson-tags-and-tag-screen.md' }];
  const branches = [
    {
      branch: 'stale-branch',
      entries: [
        { number: '0059', file: '0059-stale-name-before-rename.md', claimedAt: 50 },
      ],
    },
  ];
  assert.deepEqual(findCrossBranchCollisions({ mine, main, branches }), []);
});

test('findCrossBranchCollisions: несколько чужих веток — коллизия из каждой, что заявила номер', () => {
  const mine = [{ number: '0107', file: '0107-my-decision.md', claimedAt: 100 }];
  const main = [];
  const branches = [
    {
      branch: 'branch-a',
      entries: [{ number: '0107', file: '0107-a-decision.md', claimedAt: 50 }],
    },
    {
      branch: 'branch-b',
      entries: [{ number: '0108', file: '0108-unrelated.md', claimedAt: 50 }],
    },
    {
      branch: 'branch-c',
      entries: [{ number: '0107', file: '0107-c-decision.md', claimedAt: 300 }],
    },
  ];
  const collisions = findCrossBranchCollisions({ mine, main, branches });
  assert.deepEqual(collisions.map((c) => c.branch).sort(), ['branch-a', 'branch-c']);
});

// Инцидент 2026-09-22 (третья коллизия подряд): чужой ADR-0111 приехал в main
// уже после того, как я отвёл ветку со своим 0111. Кросс-веточная проверка
// такую пару не видела вовсе — она сравнивает только заявки, которых ещё нет
// в main, и номер, уже занятый там, из сравнения выпадал. Ветки гейт
// проверял, main — нет.
test('findMainCollisions: мой номер занят в main другим файлом — падение', () => {
  const mine = [{ number: '0111', file: '0111-my-decision.md', claimedAt: 200 }];
  const main = [{ number: '0111', file: '0111-merged-decision.md', claimedAt: 100 }];

  assert.deepEqual(findMainCollisions({ mine, main }), [
    {
      number: '0111',
      myFile: '0111-my-decision.md',
      mainFile: '0111-merged-decision.md',
    },
  ]);
});

test('findMainCollisions: тот же номер и тот же файл — это решение из main, не коллизия', () => {
  const mine = [{ number: '0111', file: '0111-merged-decision.md', claimedAt: 200 }];
  const main = [{ number: '0111', file: '0111-merged-decision.md', claimedAt: 100 }];

  assert.deepEqual(findMainCollisions({ mine, main }), []);
});

test('findMainCollisions: номера нет в main — заявка свободна', () => {
  const mine = [{ number: '0113', file: '0113-my-decision.md', claimedAt: 200 }];
  const main = [{ number: '0111', file: '0111-merged-decision.md', claimedAt: 100 }];

  assert.deepEqual(findMainCollisions({ mine, main }), []);
});

test('firstFreeNumber: с дырой в нумерации — берёт дыру', () => {
  assert.equal(firstFreeNumber(['0001', '0003']), '0002');
});

test('firstFreeNumber: без дыр — следующий после максимума', () => {
  assert.equal(firstFreeNumber(['0001', '0002', '0003']), '0004');
});

test('firstFreeNumber: пустой список — первый номер', () => {
  assert.equal(firstFreeNumber([]), '0001');
});
