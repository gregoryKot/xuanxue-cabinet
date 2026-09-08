// Вошедший без роли teacher/admin (ученик, ещё не назначенный) — кабинет
// ученика появится позже (docs/PLAN.md §1), пока только объяснение и ссылка
// на сайт школы, если учитель её заполнил на экране «Шаблоны»
// (settings.schoolSiteUrl, В6 аудита: раньше здесь была ссылка на сам
// кабинет — тупик для ученика и незнакомца). «Выйти» — в шапке AppShell,
// здесь не дублируем.
import { useAuthConfig } from '../auth/useAuthConfig';

export function StudentScreen() {
  const { config } = useAuthConfig();

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <p>Кабинет для учителя.</p>
      {config?.schoolSiteUrl ? (
        <p>
          Расписание и запись на занятия — на сайте школы:{' '}
          <a href={config.schoolSiteUrl}>{config.schoolSiteUrl}</a>
        </p>
      ) : (
        <p>Расписание вам пришлёт учитель.</p>
      )}
    </main>
  );
}
