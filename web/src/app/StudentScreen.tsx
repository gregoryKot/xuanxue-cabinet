// Вошедший без роли teacher/admin (ученик, ещё не назначенный) — кабинет
// ученика появится позже (docs/PLAN.md §1), пока только объяснение и ссылка
// на сайт школы, если учитель её заполнил на экране «Шаблоны»
// (settings.schoolSiteUrl, В6 аудита: раньше здесь была ссылка на сам
// кабинет — тупик для ученика и незнакомца).
//
// «Выйти» здесь, а не в шапке: у учителя кнопка живёт в «Настройках», а
// ученик до них не доходит — навигации у него нет (AppShell.tsx).
import { LogoutButton } from '../auth/LogoutButton';
import { useAuthConfig } from '../auth/useAuthConfig';

export function StudentScreen() {
  const { config } = useAuthConfig();

  return (
    <main style={{ padding: 24, maxWidth: 420, display: 'grid', gap: 12 }}>
      <p style={{ margin: 0 }}>Кабинет для учителя.</p>
      {config?.schoolSiteUrl ? (
        <p style={{ margin: 0 }}>
          Расписание и запись на занятия — на сайте школы:{' '}
          <a href={config.schoolSiteUrl}>{config.schoolSiteUrl}</a>
        </p>
      ) : (
        <p style={{ margin: 0 }}>Расписание вам пришлёт учитель.</p>
      )}
      <LogoutButton />
    </main>
  );
}
