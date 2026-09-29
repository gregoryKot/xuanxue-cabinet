// Гейт check-write-then-reload.mjs на вызовах по карте маршрутов (ADR-0148):
// метод живёт в ключе `apiRoute('POST /…')`, а не в `method:` — без этих
// проверок гейт слеп на каждом перенесённом вызове (находка 2026-09-29).
// Отдельным файлом: соседний check-write-then-reload.test.mjs у потолка
// храповика размера.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMutatingWriteLines,
  findWriteThenReloadFindings,
} from './check-write-then-reload.mjs';

test('findMutatingWriteLines: apiRoute с мутирующим ключом карты — найден', () => {
  const src =
    "await apiRoute('POST /broadcasts/:id/cancel', { params: { id } });\nawait reload();";
  assert.deepEqual(findMutatingWriteLines(src), [1]);
  assert.equal(findWriteThenReloadFindings('f.ts', src).length, 1);
});

test('findMutatingWriteLines: apiRoute на GET-ключ не находится', () => {
  assert.deepEqual(
    findMutatingWriteLines("apiRoute('GET /broadcasts', { signal });"),
    [],
  );
});
