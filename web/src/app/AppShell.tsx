// Оболочка кабинета — навигация и содержимое (CLAUDE.md «Мобильный экран
// первым»). Пунктов навигации четыре, список — navItems.ts, сама навигация в
// двух видах — AppNav.tsx: на телефоне нижняя панель, на широком экране
// колонка слева (docs/adr/0025-navigation-by-domain.md).
//
// Направление «Тёплая школа» (ADR-0043) убрало шапку во всю ширину и подвал
// под содержимым: на широком экране у штата школы (`hasSideNav`) их рисует
// боковая колонка сама — знак школы сверху, имя человека, «Уведомления» и
// «Выйти» снизу (AppNav.tsx). Без такой колонки — на телефоне и у ученика на
// мониторе — оболочка рисует то же самое сама, тем же `hasSideNav`, чтобы
// знак и «Выйти» не дублировались и не пропадали ни в одном сочетании роли и
// ширины экрана.
//
// Подвал под содержимым («Вы вошли как … · Уведомления · Выйти») остаётся
// только у ученика на мониторе (боковой колонки у него не бывает) — не на
// телефоне: владелец счёл его на каждом экране лишним (кнопка нужна редко,
// отзыв 2026-09-12). На телефоне эту роль берёт на себя верхняя строка
// (AppShellBrandRow.tsx: имя — ссылка на «Уведомления») и сам экран
// «Уведомления» («Выйти» переехала туда).
//
// У ученика на мониторе подвал ещё прижимался к низу окна — содержимое
// держала обёртка с `flex: 1` (болезнь, которую #198 вылечил учителю,
// ADR-0043 «Контекст»). Обёртка стала `<main>` без `flex`: растёт по
// содержимому, подвал — сразу за ним. `shellRowStyle.flex: 1` ниже не трогаем
// — им на телефоне держится нижняя панель вкладок.
// Роль без teacher/assistant/admin (ученик, бухгалтер) — StudentScreen вместо
// содержимого маршрута: у бухгалтера прав пока нет нигде (деньги — этап 3,
// docs/PLAN.md). Исключения — «/notifications» (личная настройка человека,
// ТЗ notifications-web.md) и «/attempts/:id» (экран сдачи, ТЗ
// student-exams.md): оба доступны любой роли, поэтому под них Outlet
// рисуется всегда, даже ученику (в нижнюю навигацию не входят — вход в
// экзамен только кнопкой на StudentExamsSection.tsx, docs/adr/0025).
//
// Статуса «ждёт подтверждения» больше нет (ADR-0036) — вошедший всегда либо
// уже видит свой раздел, либо гвард (RequireAuth) увёл его на /login раньше,
// чем этот компонент вообще отрисовался.
import type { CSSProperties } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { textLinkStyle } from '../components/screenLayout';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppNav } from './AppNav';
import { AppShellBrandRow } from './AppShellBrandRow';
import { isTeacher, showsRouteScreen } from './screenAccess';
import { StudentScreen } from './StudentScreen';
import { usePrefetchRoutes } from './usePrefetchRoutes';

const NOTIFICATIONS_PATH = '/notifications';

// Ширина рамки макета (ADR-0043, screens/2a-broadcasts.html): на ней нав и
// контент совпадают с мокапом один в один, а шире — лист центрируется полями,
// а не висит у левого края (на мониторе владельца ~2000px колонка 880px
// стояла прижатой влево, справа пустовало ~1100px бумаги).
const SHELL_MAX_WIDTH_PX = 1120;

const shellRowStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  minHeight: 0,
  width: '100%',
  maxWidth: SHELL_MAX_WIDTH_PX,
  marginInline: 'auto',
};

const contentColumnStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 16px',
  fontSize: 13,
  color: 'var(--ink-soft)',
};

export function AppShell() {
  const { me } = useAuth();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  // Правило «кому что показать» — screenAccess.ts, общее с
  // prefetchFirstScreen.ts (CLAUDE.md «Одна механика — один компонент»).
  const teacherRole = isTeacher(me);
  const showOutlet = showsRouteScreen(me, pathname);
  // Сюда добираются уже с подтверждённой сессией (RequireAuth выше) и
  // нарисованным первым экраном — самое время дотянуть остальные разделы в
  // простое браузера, чтобы переход по меню не ждал сети.
  usePrefetchRoutes(teacherRole);

  // Есть ли боковая колонка (только у штата школы на широком экране) —
  // от неё зависит, кто рисует знак школы и блок человека (см. шапку файла).
  const hasSideNav = teacherRole && !isMobile;

  // Подвал под содержимым — только у ученика на мониторе (см. шапку файла);
  // на телефоне «Уведомления»/«Выйти» держат AppShellBrandRow.tsx и сам экран
  // «Уведомления».
  const showFooter = !hasSideNav && !isMobile;

  return (
    // `100dvh`, не `100vh`: на телефоне адресная строка то есть, то нет, и
    // `100vh` не следит за её появлением — нижняя панель вкладок (`sticky`,
    // AppNav.tsx) на каждое такое появление подпрыгивала бы вместе с ней (тот
    // же урок, что и в .xuanxue-entry-page, index.css).
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <div style={shellRowStyle}>
        {hasSideNav && (
          <AppNav
            isMobile={false}
            me={me}
            notificationsLink={
              <Link to={NOTIFICATIONS_PATH} style={textLinkStyle}>
                Уведомления
              </Link>
            }
            logoutButton={<LogoutButton />}
          />
        )}
        <div style={contentColumnStyle}>
          {!hasSideNav && <AppShellBrandRow isMobile={isMobile} name={me?.name} />}
          <main>{showOutlet ? <Outlet /> : <StudentScreen />}</main>
          {showFooter && (
            <footer style={footerStyle}>
              <span>Вы вошли как {me?.name ?? '—'} ·</span>
              <Link to={NOTIFICATIONS_PATH} style={textLinkStyle}>
                Уведомления
              </Link>
              <span>·</span>
              <LogoutButton />
            </footer>
          )}
        </div>
      </div>

      {teacherRole && isMobile && <AppNav isMobile me={me} />}
    </div>
  );
}
