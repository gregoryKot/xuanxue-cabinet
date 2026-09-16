import { describe, expect, it } from 'vitest';
import { matchRouteLoader, ROOT_REDIRECT_PATH, ROUTE_MODULES } from './routeModules';

const routes = Object.values(ROUTE_MODULES);

describe('matchRouteLoader', () => {
  it('простой адрес раздела — загрузчик его экрана', () => {
    expect(matchRouteLoader('/exams')).toBe(ROUTE_MODULES.exams.load);
    expect(matchRouteLoader('/exams/new')).toBe(ROUTE_MODULES.examNew.load);
    expect(matchRouteLoader('/exams/652f00000000000000000001')).toBe(
      ROUTE_MODULES.examEditor.load,
    );
    expect(matchRouteLoader('/exam-items')).toBe(ROUTE_MODULES.examItems.load);
    expect(matchRouteLoader('/exam-items/new')).toBe(ROUTE_MODULES.examItemNew.load);
    expect(matchRouteLoader('/exam-items/652f00000000000000000002')).toBe(
      ROUTE_MODULES.examItemEditor.load,
    );
    expect(matchRouteLoader('/people')).toBe(ROUTE_MODULES.people.load);
  });

  it('страница канала — один чанк на «новый» и на правку (ADR-0033)', async () => {
    expect(matchRouteLoader('/channels')).toBe(ROUTE_MODULES.channels.load);
    expect(matchRouteLoader('/channels/new')).toBe(ROUTE_MODULES.channelNew.load);
    expect(matchRouteLoader('/channels/652f00000000000000000003')).toBe(
      ROUTE_MODULES.channelEditor.load,
    );
    expect(ROUTE_MODULES.channelNew.load).toBe(ROUTE_MODULES.channelEditor.load);
    // Загрузчик и правда приводит экран: опечатка в пути модуля иначе всплыла
    // бы только в браузере, пустым экраном под Suspense.
    await expect(ROUTE_MODULES.channelNew.load()).resolves.toHaveProperty('default');
  });

  it('адрес с параметром — экран, у которого маршрут с :параметром', () => {
    expect(matchRouteLoader('/grading/abc')).toBe(ROUTE_MODULES.attemptReview.load);
    expect(matchRouteLoader('/attempts/652f00000000000000000001')).toBe(
      ROUTE_MODULES.attempt.load,
    );
    expect(matchRouteLoader('/join/ABC123')).toBe(ROUTE_MODULES.join.load);
  });

  it('раздел и его подэкран не путаются: /grading — очередь, /grading/:id — разбор', () => {
    expect(matchRouteLoader('/grading')).toBe(ROUTE_MODULES.grading.load);
    expect(matchRouteLoader('/grading/abc/extra')).toBeNull();
  });

  it('корень — туда же, куда ведёт редирект с корня', () => {
    expect(matchRouteLoader('/')).toBe(ROUTE_MODULES.planning.load);
    expect(ROOT_REDIRECT_PATH).toBe(ROUTE_MODULES.planning.path);
  });

  it('хвостовой слеш не мешает', () => {
    expect(matchRouteLoader('/exams/')).toBe(ROUTE_MODULES.exams.load);
  });

  it('неизвестный адрес — null, грузить заранее нечего', () => {
    expect(matchRouteLoader('/nonexistent')).toBeNull();
    expect(matchRouteLoader('/exams/extra/deep')).toBeNull();
  });
});

describe('ROUTE_MODULES', () => {
  it('экраны входа не греются в фоне — вошедшему они не нужны', () => {
    const notWarmed = routes.filter((route) => !route.warm).map((route) => route.path);
    expect(notWarmed.sort()).toEqual(['/join/:code', '/login', '/login/email']);
  });

  it('у каждого экрана свой путь — иначе первый перекрывает второй', () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
