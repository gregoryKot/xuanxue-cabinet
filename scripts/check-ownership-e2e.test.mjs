// Тест на парсер check-ownership-e2e.mjs (CLAUDE.md, правило 3: «новый
// эндпоинт = DTO + e2e на владение»): фикстуры-строки, не реальное дерево
// api/src и api/test — иначе тест ловит только сегодняшнее состояние
// репозитория, а не разбор.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  controllerSearchKeys,
  hasDenialAssertion,
  findUncoveredControllers,
} from './check-ownership-e2e.mjs';

test('controllerSearchKeys: обычный префикс — один ключ', () => {
  assert.deepEqual(controllerSearchKeys(`@Controller('lessons')`), ['/api/lessons']);
});

test('controllerSearchKeys: комментарий с `@Controller()` до настоящего декоратора не сбивает префикс', () => {
  const src = `
// Комментарий упоминает @Controller() как пример, а не как декоратор —
// настоящий префикс ниже, его не должно перебить.
@Controller('auth')
class JoinController {}`;
  assert.deepEqual(controllerSearchKeys(src), ['/api/auth']);
});

test('controllerSearchKeys: несколько префиксов в массиве — ключ на каждый', () => {
  const src = `@Controller(['v1/things', 'v2/things'])`;
  assert.deepEqual(controllerSearchKeys(src).sort(), [
    '/api/v1/things',
    '/api/v2/things',
  ]);
});

test('controllerSearchKeys: @Controller() без аргумента — первый сегмент пути хендлеров', () => {
  const src = `
@Controller()
class ExamAttemptsController {
  @Post('exams/:examId/attempts')
  start() {}

  @Patch('attempts/:id/answers')
  saveAnswers() {}
}`;
  assert.deepEqual(controllerSearchKeys(src).sort(), ['/api/attempts', '/api/exams']);
});

test('hasDenialAssertion: supertest .expect(403)', () => {
  assert.equal(hasDenialAssertion(`await request(app).get('/x').expect(403);`), true);
});

test('hasDenialAssertion: jest toBe(401)', () => {
  assert.equal(hasDenialAssertion(`expect(res.status).toBe(401);`), true);
});

test('hasDenialAssertion: jest toEqual(404)', () => {
  assert.equal(hasDenialAssertion(`expect(res.status).toEqual(404);`), true);
});

test('hasDenialAssertion: HttpStatus.FORBIDDEN', () => {
  const src = `expect(res.status).toBe(HttpStatus.FORBIDDEN);`;
  assert.equal(hasDenialAssertion(src), true);
});

test('hasDenialAssertion: только успешные статусы — не отказ', () => {
  assert.equal(hasDenialAssertion(`expect(res.status).toBe(200);`), false);
});

test('findUncoveredControllers: покрывающая спека закрывает контроллер', () => {
  const controllers = [
    { fileLabel: 'lessons.controller.ts', src: `@Controller('lessons')` },
  ];
  const specs = [
    {
      fileLabel: 'lessons.e2e-spec.ts',
      src: `request(app).get('/api/lessons').expect(403);`,
    },
  ];
  assert.deepEqual(findUncoveredControllers(controllers, specs), []);
});

test('findUncoveredControllers: спеку нашли, но в ней нет отказа — провал', () => {
  const controllers = [
    { fileLabel: 'lessons.controller.ts', src: `@Controller('lessons')` },
  ];
  const specs = [
    {
      fileLabel: 'lessons.e2e-spec.ts',
      src: `request(app).get('/api/lessons').expect(200);`,
    },
  ];
  const uncovered = findUncoveredControllers(controllers, specs);
  assert.equal(uncovered.length, 1);
  assert.equal(uncovered[0].file, 'lessons.controller.ts');
  assert.deepEqual(uncovered[0].keys, ['/api/lessons']);
});

test('findUncoveredControllers: к префиксу контроллера никто не обращается — провал', () => {
  const controllers = [
    { fileLabel: 'orphan.controller.ts', src: `@Controller('orphan')` },
  ];
  const specs = [
    {
      fileLabel: 'other.e2e-spec.ts',
      src: `request(app).get('/api/other').expect(403);`,
    },
  ];
  const uncovered = findUncoveredControllers(controllers, specs);
  assert.equal(uncovered.length, 1);
  assert.equal(uncovered[0].file, 'orphan.controller.ts');
});
