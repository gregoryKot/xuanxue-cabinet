# 0013. Отдельный модуль модели разрывает цикл Classes ↔ Lessons

Дата: 2026-09-06. Статус: принято.

## Контекст

`ClassesService.remove()` проверяет даты занятий — нужна модель `LessonRecord`.
`LessonsService.create()`/`list()` проверяют класс — нужна модель `ClassRecord`.
Импорт модулей целиком друг в друга — цикл, который Nest не разрешает.

## Решение

Модель, не домен: `LessonModelModule` только регистрирует
`MongooseModule.forFeature` для `LessonRecord`. `ClassesModule` импортирует его
вместо `LessonsModule`. `LessonsModule` импортирует и `LessonModelModule`, и
`ClassesModule` целиком (нужна логика класса), экспортирует `LessonModelModule`
дальше — `SchedulerModule` как импортировал оба домена напрямую, так и импортирует.

## Альтернативы

- `forwardRef()` — маскирует причину цикла, в проекте не используется нигде.
- Общий модуль с обеими моделями — лишний уровень ради двух моделей.

## Последствия

- Модель `LessonRecord` регистрируется один раз (CLAUDE.md «Файлы»).
- Тот же приём годится для будущих циклов домена школы (channels/broadcasts/
  deliveries).
- Гейт: `model.registry.spec.ts`, e2e на реальном `AppModule` — граф модулей не
  разрешился бы при цикле.
