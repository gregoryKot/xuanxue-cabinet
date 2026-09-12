// Первый экран ученика (docs/PLAN.md §11, слой 4.1; ТЗ student-screen.md) —
// ближайшие занятия школы. Сам экран и карточка занятия — в web/src/student/
// (CLAUDE.md «Файлы»: один экран — один каталог); здесь только тонкая
// сборка со ссылкой на сайт школы, если учитель её заполнил на экране
// «Шаблоны» (settings.schoolSiteUrl, В6 аудита: раньше здесь была ссылка на
// сам кабинет — тупик для ученика и незнакомца). Ссылка — ниже расписания,
// не вместо него (ТЗ, п.4): занятия — то, ради чего ученик сюда зашёл.
//
// «Выйти» — в подвале AppShell.tsx, общем для учителя и ученика: своя кнопка
// здесь дублировала бы её на этом же экране (её механику проверяют
// AppShell.test.tsx и LogoutButton.test.tsx).
import { useAuthConfig } from '../auth/useAuthConfig';
import { screenExplanationStyle } from '../components/screenLayout';
import { StudentLessonsScreen } from '../student/StudentLessonsScreen';

// Тот же боковой отступ, что у StudentLessonsScreen (components/
// screenLayout.ts: padding 16) — ссылка продолжает колонку расписания, а не
// начинает свою.
const schoolSiteLinkStyle = { ...screenExplanationStyle, padding: '0 16px 16px' };

export function StudentScreen() {
  const { config } = useAuthConfig();

  return (
    <>
      <StudentLessonsScreen />
      {config?.schoolSiteUrl && (
        <p style={schoolSiteLinkStyle}>
          Ещё расписание и запись — на сайте школы:{' '}
          <a href={config.schoolSiteUrl}>{config.schoolSiteUrl}</a>
        </p>
      )}
    </>
  );
}
