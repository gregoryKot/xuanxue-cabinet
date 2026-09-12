// Вошедший без роли teacher/assistant/admin (ученик, бухгалтер, ещё не
// назначенный) — кабинет ученика появится позже (docs/PLAN.md §1), пока
// только объяснение и ссылка на сайт школы, если учитель её заполнил на
// экране «Шаблоны»
// (settings.schoolSiteUrl, В6 аудита: раньше здесь была ссылка на сам
// кабинет — тупик для ученика и незнакомца).
//
// «Выйти» — в подвале AppShell.tsx, общем для учителя и ученика: своя кнопка
// здесь дублировала бы её на этом же экране (её механику проверяют
// AppShell.test.tsx и LogoutButton.test.tsx).
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
    </main>
  );
}
