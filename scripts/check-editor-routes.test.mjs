// Тест на парсер check-editor-routes.mjs (CLAUDE.md, храповик
// «check-editor-routes.mjs»): фикстуры-строки, не реальное дерево web/src и
// api/src — тот же приём, что в check-route-collisions.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findUseEntityEditorPathArgs,
  resolvePathConstants,
  checkEditorRoutes,
} from './check-editor-routes.mjs';

test('findUseEntityEditorPathArgs: простой вызов без дженериков', () => {
  const src = `return useEntityEditor(CLASSES_PATH, classId, LOAD_ERROR_MESSAGE);`;
  assert.deepEqual(findUseEntityEditorPathArgs(src), ['CLASSES_PATH']);
});

test('findUseEntityEditorPathArgs: вызов с однострочным дженериком', () => {
  const src = `const editor = useEntityEditor<LessonDto, CreateLessonInput, UpdateLessonInput>(
    LESSONS_PATH,
    lessonId,
    LOAD_ERROR_MESSAGE,
  );`;
  assert.deepEqual(findUseEntityEditorPathArgs(src), ['LESSONS_PATH']);
});

test('findUseEntityEditorPathArgs: вызов с многострочным дженериком (как useMaterialEditor.ts)', () => {
  const src = `return useEntityEditor<
    MaterialDto,
    CreateMaterialInput,
    UpdateMaterialInput,
    MaterialDto
  >(
    MATERIALS_PATH,
    materialId,
    LOAD_ERROR_MESSAGE,
  );`;
  assert.deepEqual(findUseEntityEditorPathArgs(src), ['MATERIALS_PATH']);
});

test('findUseEntityEditorPathArgs: объявление самого хука — не вызов', () => {
  const src = `export function useEntityEditor<TDto, TCreateInput, TUpdateInput, TCreateResult = void>(
  collectionPath: string,
  id: string | undefined,
  loadErrorMessage: string,
): UseEntityEditorResult<TDto, TCreateInput, TUpdateInput, TCreateResult> {`;
  assert.deepEqual(findUseEntityEditorPathArgs(src), []);
});

test('findUseEntityEditorPathArgs: закомментированный вызов не считается', () => {
  const src = `// return useEntityEditor(OLD_PATH, id, MSG);
return useEntityEditor(CHANNELS_PATH, channelId, MSG);`;
  assert.deepEqual(findUseEntityEditorPathArgs(src), ['CHANNELS_PATH']);
});

test('resolvePathConstants: одинарные и двойные кавычки', () => {
  const src = `export const CLASSES_PATH = '/classes';\nexport const EXAMS_PATH = "/exams";\n`;
  const constants = resolvePathConstants(src);
  assert.equal(constants.get('CLASSES_PATH'), '/classes');
  assert.equal(constants.get('EXAMS_PATH'), '/exams');
});

test('resolvePathConstants: составной путь (шаблонный литерал) не резолвится', () => {
  const src = `export const CLASSES_PATH = '/classes';\nexport const CLASSES_LIST_PATH = \`\${CLASSES_PATH}?limit=1\`;\n`;
  const constants = resolvePathConstants(src);
  assert.equal(constants.has('CLASSES_LIST_PATH'), false);
});

test('checkEditorRoutes: маршрут есть — находок нет', () => {
  const apiPathsSrc = `export const CLASSES_PATH = '/classes';`;
  const webFiles = [
    {
      file: 'web/src/schedule/useClassEditor.ts',
      src: `useEntityEditor(CLASSES_PATH, id, MSG);`,
    },
  ];
  const routes = new Set(['GET /classes', 'GET /classes/:*']);
  assert.deepEqual(checkEditorRoutes({ webFiles, apiPathsSrc, routes }), []);
});

// Регрессия инцидента 2026-09-27: MaterialsController без @Get(':id').
test('checkEditorRoutes: маршрута GET .../:id нет — находка missing-route', () => {
  const apiPathsSrc = `export const MATERIALS_PATH = '/materials';`;
  const webFiles = [
    {
      file: 'web/src/materials/useMaterialEditor.ts',
      src: `useEntityEditor<MaterialDto, CreateMaterialInput, UpdateMaterialInput, MaterialDto>(
        MATERIALS_PATH,
        materialId,
        LOAD_ERROR_MESSAGE,
      );`,
    },
  ];
  const routes = new Set(['GET /materials', 'POST /materials']);
  assert.deepEqual(checkEditorRoutes({ webFiles, apiPathsSrc, routes }), [
    {
      file: 'web/src/materials/useMaterialEditor.ts',
      constName: 'MATERIALS_PATH',
      path: '/materials',
      expectedRoute: 'GET /materials/:*',
      kind: 'missing-route',
    },
  ]);
});

test('checkEditorRoutes: константа не найдена в apiPaths.ts — находка unresolved', () => {
  const apiPathsSrc = `export const CLASSES_PATH = '/classes';`;
  const webFiles = [
    {
      file: 'web/src/widgets/useWidgetEditor.ts',
      src: `useEntityEditor(WIDGETS_PATH, id, MSG);`,
    },
  ];
  const routes = new Set(['GET /classes/:*']);
  assert.deepEqual(checkEditorRoutes({ webFiles, apiPathsSrc, routes }), [
    {
      file: 'web/src/widgets/useWidgetEditor.ts',
      constName: 'WIDGETS_PATH',
      kind: 'unresolved',
    },
  ]);
});
