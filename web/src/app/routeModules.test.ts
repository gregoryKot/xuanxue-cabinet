import { describe, expect, it } from 'vitest';
import { matchRoute } from './routeMatch';
import { ROUTE_MODULES } from './routeModules';

const routes = Object.values(ROUTE_MODULES);

/** Загрузчик чанка для этого адреса — `null`, если адрес не наш. */
function loaderAt(pathname: string) {
  return matchRoute(pathname)?.load ?? null;
}

describe('matchRoute', () => {
  it('простой адрес раздела — загрузчик его экрана', () => {
    expect(loaderAt('/exams')).toBe(ROUTE_MODULES.exams.load);
    expect(loaderAt('/exams/new')).toBe(ROUTE_MODULES.examNew.load);
    expect(loaderAt('/exams/652f00000000000000000001')).toBe(
      ROUTE_MODULES.examEditor.load,
    );
    expect(loaderAt('/exams/652f00000000000000000001/preview')).toBe(
      ROUTE_MODULES.examPreview.load,
    );
    expect(loaderAt('/exam-items')).toBe(ROUTE_MODULES.examItems.load);
    expect(loaderAt('/exam-items/new')).toBe(ROUTE_MODULES.examItemNew.load);
    expect(loaderAt('/exam-items/652f00000000000000000002')).toBe(
      ROUTE_MODULES.examItemEditor.load,
    );
    expect(loaderAt('/people')).toBe(ROUTE_MODULES.people.load);
    expect(loaderAt('/welcome')).toBe(ROUTE_MODULES.welcome.load);
    expect(loaderAt('/tasks')).toBe(ROUTE_MODULES.tasks.load);
    expect(loaderAt('/lessons')).toBe(ROUTE_MODULES.studentLessons.load);
    expect(loaderAt('/planning')).toBe(ROUTE_MODULES.planning.load);
    expect(loaderAt('/planning/new')).toBe(ROUTE_MODULES.lessonNew.load);
    expect(loaderAt('/planning/652f00000000000000000003')).toBe(
      ROUTE_MODULES.lessonEditor.load,
    );
    expect(loaderAt('/schedule')).toBe(ROUTE_MODULES.schedule.load);
    expect(loaderAt('/schedule/new')).toBe(ROUTE_MODULES.classNew.load);
    expect(loaderAt('/schedule/652f00000000000000000004')).toBe(
      ROUTE_MODULES.classEditor.load,
    );
    expect(loaderAt('/materials')).toBe(ROUTE_MODULES.materials.load);
    expect(loaderAt('/materials/new')).toBe(ROUTE_MODULES.materialNew.load);
    expect(loaderAt('/materials/652f00000000000000000008')).toBe(
      ROUTE_MODULES.materialEditor.load,
    );
  });

  it('страница материала — один чанк на «новый» и на правку (ADR-0033)', async () => {
    expect(ROUTE_MODULES.materialNew.load).toBe(ROUTE_MODULES.materialEditor.load);
    await expect(ROUTE_MODULES.materialNew.load()).resolves.toHaveProperty('default');
    await expect(ROUTE_MODULES.materials.load()).resolves.toHaveProperty('default');
  });

  it('страница канала — один чанк на «новый» и на правку (ADR-0033)', async () => {
    expect(loaderAt('/channels')).toBe(ROUTE_MODULES.channels.load);
    expect(loaderAt('/channels/new')).toBe(ROUTE_MODULES.channelNew.load);
    expect(loaderAt('/channels/652f00000000000000000003')).toBe(
      ROUTE_MODULES.channelEditor.load,
    );
    expect(ROUTE_MODULES.channelNew.load).toBe(ROUTE_MODULES.channelEditor.load);
    // Загрузчик и правда приводит экран: опечатка в пути модуля иначе всплыла
    // бы только в браузере, пустым экраном под Suspense.
    await expect(ROUTE_MODULES.channelNew.load()).resolves.toHaveProperty('default');
  });

  it('предпросмотр экзамена — свой чанк, редактор и предпросмотр не путаются', async () => {
    expect(loaderAt('/exams/652f00000000000000000001')).toBe(
      ROUTE_MODULES.examEditor.load,
    );
    expect(loaderAt('/exams/652f00000000000000000001/preview')).toBe(
      ROUTE_MODULES.examPreview.load,
    );
    await expect(ROUTE_MODULES.examPreview.load()).resolves.toHaveProperty('default');
  });

  it('новая рассылка — свой адрес, у журнала свой (ADR-0033)', async () => {
    expect(loaderAt('/broadcasts')).toBe(ROUTE_MODULES.broadcasts.load);
    expect(loaderAt('/broadcasts/new')).toBe(ROUTE_MODULES.broadcastNew.load);
    await expect(ROUTE_MODULES.broadcastNew.load()).resolves.toHaveProperty('default');
  });

  it('адрес с параметром — экран, у которого маршрут с :параметром', () => {
    expect(loaderAt('/grading/abc')).toBe(ROUTE_MODULES.attemptReview.load);
    expect(loaderAt('/attempts/652f00000000000000000001')).toBe(
      ROUTE_MODULES.attempt.load,
    );
    expect(loaderAt('/join/ABC123')).toBe(ROUTE_MODULES.join.load);
  });

  it('раздел и его подэкран не путаются: /grading — очередь, /grading/:id — разбор', () => {
    expect(loaderAt('/grading')).toBe(ROUTE_MODULES.grading.load);
    expect(loaderAt('/grading/abc/extra')).toBeNull();
  });

  // Роль ушла в rootPathFor (screenAccess.ts, screenAccess.test.ts) — этот
  // резолвер по-прежнему без роли, «/» (сегментов нет) сопоставляется с
  // «Занятиями» как единственный опорный путь для чанка/prefetch.
  it('корень (сегментов нет) — чанк «Занятий»', () => {
    expect(loaderAt('/')).toBe(ROUTE_MODULES.planning.load);
  });

  it('хвостовой слеш не мешает', () => {
    expect(loaderAt('/exams/')).toBe(ROUTE_MODULES.exams.load);
  });

  it('неизвестный адрес — null, грузить заранее нечего', () => {
    expect(loaderAt('/nonexistent')).toBeNull();
    expect(loaderAt('/exams/extra/deep')).toBeNull();
  });
});

describe('ROUTE_MODULES', () => {
  it('экраны входа не греются в фоне — вошедшему они не нужны', () => {
    const notWarmed = routes.filter((route) => !route.warm).map((route) => route.path);
    expect(notWarmed.sort()).toEqual([
      '/join/:code',
      '/login',
      '/login/email',
      '/welcome',
    ]);
  });

  it('у каждого экрана свой путь — иначе первый перекрывает второй', () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
