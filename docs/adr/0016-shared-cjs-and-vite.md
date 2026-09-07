# 0016. `shared` остаётся CommonJS, web подключает его через `commonjsOptions`

Дата: 2026-09-07. Статус: принято.

## Контекст

`shared/tsconfig.json` собирает `dist/` в CommonJS — так его читает `api`
(ts-node/Jest). `web/src` до PR J1 импортировал из `@xuanxue/shared` только
типы (стёрты tsc), поэтому Vite ни разу не интероп-конвертировал CJS в
прод-сборке. Первый рантайм-импорт вскрыл: `@xuanxue/shared` — симлинк
воркспейса, Vite резолвит его по реальному пути вне `node_modules` и не
применяет commonjs-интероп — именованные экспорты пропадают в `vite build`.

## Решение

`web/vite.config.ts`: `build.commonjsOptions.include: [/node_modules/,
/shared[\\/]dist/]` — включает симлинк-путь в commonjs-обработку явно.

## Альтернативы

- ESM-сборка `shared` — дала бы tree-shaking, но ломает `api` (CommonJS) без
  отдельной миграции; отложено — бандл 79/200 КБ gzip, запас есть.
- `resolve.preserveSymlinks: true` — тоже работает, но меняет резолв путей
  везде, а не только commonjs-интероп.

## Последствия

Проверка — `npm run build --workspace=web` (падает без `commonjsOptions`),
гейты `check-bundle-size.mjs`/`check-pwa.mjs`.
