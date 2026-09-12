# Как писать ownership-тест

Правило CLAUDE.md: «новый эндпоинт = DTO с class-validator + e2e на владение» —
пользователь А не должен увидеть данные пользователя Б через HTTP.

Два класса данных, два теста (ADR-0010). **Данные ученика** — по владельцу из
сессии, шаги 1–6 ниже. **Данные школы** (`classes`, `lessons`, `channels`,
`broadcasts`, `deliveries`) — по роли: без сессии 401, без ролей (`roles: []`)
и `student` — 403, `teacher`/`assistant`/`admin` — 200 (помощник учителя
правами равен учителю везде, кроме `UsersController` — там `assistant` не
допущен, назначение ролей и удаление данных остаются только у admin);
отдельно — секретных полей (`config` канала) нет в ответе ни у одной роли,
включая admin.

1. Поднять приложение через `createTestApp()` из `create-app.ts` (реальный
   `AppModule` на `MongoMemoryServer`, те же пайпы/фильтры/префикс, что в проде).
2. Создать двух пользователей (А и Б) — через сервис или сид напрямую в БД,
   без прохождения полного флоу входа, если он не нужен тесту.
3. Получить сессию каждого через `createUserWithSession` (ниже) — она создаёт
   cookie напрямую, не проходя `/auth/*`.
4. Создать ресурс от имени А (например, `POST /classes` с токеном А).
5. Запросить/изменить/удалить этот ресурс токеном Б — ожидать 403 или 404
   (не 200 и не утечку чужих полей), для каждого маршрута, что его касается
   (`GET`, `PATCH`, `DELETE`, вложенные `POST .../send-now` и т.п.).
6. Проверить и обратное: Б создаёт свой ресурс — он не виден в списках А.

Файл — `test/<домен>-ownership.e2e-spec.ts` для данных ученика, `test/<домен>.e2e-spec.ts`
без `-ownership` для данных школы (роль, не владелец) — один на контроллер/домен.
Образец теста «данные школы» — `test/classes.e2e-spec.ts`.

## Сессия для теста — `createUserWithSession`

`test/e2e-support/session.ts` — образец для шагов 2–3 выше и для любого
будущего ownership/role-теста (ADR-0012):

```ts
const { userId, cookie } = await createUserWithSession(testApp.app, {
  name: 'Мария',
  roles: ['admin'], // [] — гость (SECURITY §2), ['teacher'], ['student'], …
});

await request(server()).get('/api/classes').set('Cookie', cookie);
```

Создаёт `UserRecord` напрямую в БД (без флоу входа — виджет Telegram ещё не
подключён) и подписывает cookie тем же `signSession`, что использует `AuthGuard`, с
`JWT_SECRET` из `process.env` (его выставляет `setTestEnv()` в
`create-app.ts` до старта `AppModule`). Опционально `status` (по умолчанию
`'active'`, `'blocked'` — для теста на 403) и `issuedAt` (по умолчанию
«сейчас» — для теста на протухший токен или на rolling-перевыпуск после
`SESSION_RENEW_AFTER_DAYS`, см. `auth.e2e-spec.ts`).

Мутирующий запрос (`POST`/`PATCH`/`PUT`/`DELETE`) в тесте всегда добавляет
заголовок `x-requested-with` — CSRF-гвард требует его для любого мутирующего
маршрута, кроме `@SkipCsrf()` (SECURITY §2).

`test/e2e-support/http.ts` — общие `withCsrf(req)` и `sessionCookieFor(app, roles)`
(обёртка над `createUserWithSession` выше) для любого нового `*.e2e-spec.ts`.
