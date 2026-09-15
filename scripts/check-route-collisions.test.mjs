// Тест на парсер check-route-collisions.mjs (CLAUDE.md, храповик
// «check-route-collisions.mjs»): фикстуры-строки, не реальное дерево api/src
// — иначе тест ловит только сегодняшнее состояние репозитория, а не разбор.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseControllerPrefixes,
  extractRoutes,
  findCollisions,
} from './check-route-collisions.mjs';

test('parseControllerPrefixes: @Controller() без аргумента — один пустой префикс', () => {
  assert.deepEqual(parseControllerPrefixes('@Controller()\nclass A {}'), ['']);
});

test('parseControllerPrefixes: одинарные кавычки', () => {
  assert.deepEqual(parseControllerPrefixes(`@Controller('lessons')`), ['lessons']);
});

test('parseControllerPrefixes: двойные кавычки', () => {
  assert.deepEqual(parseControllerPrefixes(`@Controller("lessons")`), ['lessons']);
});

test('parseControllerPrefixes: массив префиксов — каждый отдельно', () => {
  assert.deepEqual(parseControllerPrefixes(`@Controller(['a', 'b'])`), ['a', 'b']);
});

test('parseControllerPrefixes: массив в двойных кавычках', () => {
  assert.deepEqual(parseControllerPrefixes(`@Controller(["a", "b"])`), ['a', 'b']);
});

test('parseControllerPrefixes: файл без @Controller — null', () => {
  assert.equal(parseControllerPrefixes('export class NotAController {}'), null);
});

test('extractRoutes: @Get()/@Post("x") под общим префиксом', () => {
  const src = `
@Controller('lessons')
class LessonsController {
  @Get()
  list() {}

  @Post('bulk')
  bulk() {}
}`;
  const routes = extractRoutes('a.controller.ts', src).map((r) => r.route);
  assert.deepEqual(routes.sort(), ['GET /lessons', 'POST /lessons/bulk'].sort());
});

test('extractRoutes: @Controller() без аргумента — путь ровно у хендлера', () => {
  const src = `
@Controller()
class ExamAttemptsController {
  @Post('attempts')
  start() {}
}`;
  const routes = extractRoutes('exam-attempts.controller.ts', src);
  assert.deepEqual(routes, [
    { route: 'POST /attempts', file: 'exam-attempts.controller.ts' },
  ]);
});

test('extractRoutes: @All(...) распознаётся как отдельный метод', () => {
  const src = `
@Controller('webhook')
class WebhookController {
  @All()
  any() {}
}`;
  const routes = extractRoutes('w.controller.ts', src).map((r) => r.route);
  assert.deepEqual(routes, ['ALL /webhook']);
});

test('extractRoutes: массив префиксов даёт маршрут под каждым', () => {
  const src = `
@Controller(['v1/things', 'v2/things'])
class ThingsController {
  @Get(':id')
  get() {}
}`;
  const routes = extractRoutes('t.controller.ts', src).map((r) => r.route);
  assert.deepEqual(routes.sort(), ['GET /v1/things/:*', 'GET /v2/things/:*'].sort());
});

test('findCollisions: два контроллера регистрируют один маршрут', () => {
  const a = `
@Controller('things')
class A {
  @Get()
  list() {}
}`;
  const b = `
@Controller('things')
class B {
  @Get()
  listAgain() {}
}`;
  const { collisions } = findCollisions([
    { fileLabel: 'a.controller.ts', src: a },
    { fileLabel: 'b.controller.ts', src: b },
  ]);
  assert.deepEqual(collisions, {
    'GET /things': ['a.controller.ts', 'b.controller.ts'],
  });
});

test('findCollisions: разные маршруты — коллизий нет', () => {
  const a = `
@Controller('things')
class A {
  @Get()
  list() {}
}`;
  const b = `
@Controller('other')
class B {
  @Get()
  list() {}
}`;
  const { collisions } = findCollisions([
    { fileLabel: 'a.controller.ts', src: a },
    { fileLabel: 'b.controller.ts', src: b },
  ]);
  assert.deepEqual(collisions, {});
});
