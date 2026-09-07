// Вошедший без роли teacher/admin (ученик, ещё не назначенный) — кабинет
// ученика появится позже (docs/PLAN.md §1), пока только объяснение и ссылка
// на сайт школы. «Выйти» — в шапке AppShell, здесь не дублируем.
import { useAuthConfig } from '../auth/useAuthConfig';

export function StudentScreen() {
  const { config } = useAuthConfig();

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <p>Кабинет для учителя. Расписание школы — на сайте.</p>
      {config?.publicUrl && (
        <p>
          <a href={config.publicUrl}>{config.publicUrl}</a>
        </p>
      )}
    </main>
  );
}
