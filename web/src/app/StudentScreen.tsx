// Первый экран ученика (docs/PLAN.md §11, слои 4.1 и 4.4; ТЗ
// student-screen.md, student-exams.md) — ближайшее занятие, следующие за
// ним, экзамены и, в самом низу, ссылка на сайт школы, если учитель её
// заполнил на экране «Шаблоны» (settings.schoolSiteUrl, В6 аудита: раньше
// здесь была ссылка на сам кабинет — тупик для ученика и незнакомца).
//
// Облик — макет 1c-planning.html (docs/adr/0043): приветствие по имени тихой
// строкой, заголовок «Ближайшее занятие» антиквой крупнее обычного
// (screenTitleStyle идёт с весом 300 и нужен другим разделам кабинета —
// здесь свой вес и межстрочный интервал, как у экрана входа,
// .xuanxue-login-title). Колонка экрана живёт здесь, а не в каждом разделе:
// занятия и экзамены обязаны стоять в одном поле, иначе на 360px видно, что
// их верстали порознь.
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
// Тихая строка приветствия — не .xuanxue-eyebrow (растяжка-заглавные): в
// макете это обычный текст поменьше, не служебная рубрика над блоком.
const greetingStyle: CSSProperties = { fontSize: 14, color: 'var(--ink-soft)' };
// Крупнее обычного screenTitleStyle (вес 300, интервал 1) — тот стиль общий
// для заголовков разделов кабинета, а этот экран, как и вход
// (.xuanxue-login-title), первое, что видит человек после входа.
const titleStyle: CSSProperties = {
  ...screenTitleStyle,
  fontWeight: 400,
  lineHeight: 1.05,
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
        <span style={greetingStyle}>{greeting(me?.name)}</span>
        <h1 style={titleStyle}>{TITLE}</h1>
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
