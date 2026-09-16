// Первый экран ученика (docs/PLAN.md §11, слои 4.1 и 4.4; ТЗ
// student-screen.md, student-exams.md) — ближайшее занятие, следующие за
// ним, экзамены и, в самом низу, ссылка на сайт школы, если учитель её
// заполнил на экране «Шаблоны» (settings.schoolSiteUrl, В6 аудита: раньше
// здесь была ссылка на сам кабинет — тупик для ученика и незнакомца).
//
// Облик — макет Student.dc.html (направление docs/adr/0031): приветствие
// по имени растяжкой-заглавными, заголовок «Ближайшее занятие» антиквой,
// дальше разделы строками. Колонка экрана живёт здесь, а не в каждом
// разделе: занятия и экзамены обязаны стоять в одном поле, иначе на 360px
// видно, что их верстали порознь.
//
// «Выйти» — в подвале AppShell.tsx, общем для учителя и ученика: своя кнопка
// здесь дублировала бы её на этом же экране (её механику проверяют
// AppShell.test.tsx и LogoutButton.test.tsx).
import type { CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useAuthConfig } from '../auth/useAuthConfig';
import {
  screenExplanationStyle,
  screenHintStyle,
  screenSectionStyle,
  screenTitleStyle,
  textLinkStyle,
} from '../components/screenLayout';
import { StudentExamsSection } from '../student/StudentExamsSection';
import { StudentLessonsScreen } from '../student/StudentLessonsScreen';

const TITLE = 'Ближайшее занятие';
// Чей это час — вопрос, который ученик задаёт первым, если школа живёт в
// другом поясе (CLAUDE.md «Время»: интерфейс показывает пояс зрителя).
// Пояс школы не назван: `/me/lessons` его не отдаёт, а выдумывать нельзя.
const TIME_HINT = 'Время — по вашим часам.';
const SCHOOL_SITE_TEXT = 'Ещё расписание и запись — на сайте школы:';

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
// screenHintStyle подтягивает приписку отрицательным отступом — здесь
// расстояние держит `gap` колонки.
const timeHintStyle: CSSProperties = { ...screenHintStyle, margin: 0 };
const schoolSiteStyle: CSSProperties = {
  ...screenExplanationStyle,
  paddingTop: 20,
  borderTop: '1px solid var(--line)',
};

/** Имени ещё нет (сессия перечитывается) — здороваемся без него, а не
 * подставляем прочерк: «Здравствуйте, —» читается как сбой. */
function greeting(name: string | undefined): string {
  return name ? `Здравствуйте, ${name}` : 'Здравствуйте';
}

export function StudentScreen() {
  const { config } = useAuthConfig();
  const { me } = useAuth();

  return (
    <section style={screenSectionStyle}>
      <div style={headerStyle}>
        <span className="xuanxue-eyebrow">{greeting(me?.name)}</span>
        <h1 style={screenTitleStyle}>{TITLE}</h1>
        <p style={timeHintStyle}>{TIME_HINT}</p>
      </div>
      <StudentLessonsScreen />
      <StudentExamsSection />
      {config?.schoolSiteUrl && (
        <p style={schoolSiteStyle}>
          {SCHOOL_SITE_TEXT}{' '}
          <a href={config.schoolSiteUrl} style={textLinkStyle}>
            {config.schoolSiteUrl}
          </a>
        </p>
      )}
    </section>
  );
}
