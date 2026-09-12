// Первый экран ученика (docs/PLAN.md §11, слои 4.1 и 4.4; ТЗ
// student-screen.md, student-exams.md) — ближайшие занятия школы и, под
// ними, экзамены. Сам экран и его разделы — в web/src/student/ (CLAUDE.md
// «Файлы»: один экран — один каталог); здесь только тонкая сборка со
// ссылкой на сайт школы, если учитель её заполнил на экране «Шаблоны»
// (settings.schoolSiteUrl, В6 аудита: раньше здесь была ссылка на сам
// кабинет — тупик для ученика и незнакомца). Ссылка — в самом низу, не
// вместо занятий и экзаменов (ТЗ, п.4): ради них ученик сюда зашёл.
//
// «Выйти» — в подвале AppShell.tsx, общем для учителя и ученика: своя кнопка
// здесь дублировала бы её на этом же экране (её механику проверяют
// AppShell.test.tsx и LogoutButton.test.tsx).
import { useAuthConfig } from '../auth/useAuthConfig';
import { screenExplanationStyle } from '../components/screenLayout';
import { StudentExamsSection } from '../student/StudentExamsSection';
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
      <div style={{ padding: '0 16px' }}>
        <StudentExamsSection />
      </div>
      {config?.schoolSiteUrl && (
        <p style={schoolSiteLinkStyle}>
          Ещё расписание и запись — на сайте школы:{' '}
          <a href={config.schoolSiteUrl}>{config.schoolSiteUrl}</a>
        </p>
      )}
    </>
  );
}
