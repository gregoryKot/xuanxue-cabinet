// Оболочка кабинета — навигация и содержимое (CLAUDE.md «Мобильный экран
// первым»). Пункты навигации — два набора по роли (navItems.ts:
// STAFF_NAV_ITEMS/STUDENT_NAV_ITEMS), сама навигация в двух видах —
// AppNav.tsx: на телефоне нижняя панель, на широком экране колонка слева
// (docs/adr/0025-navigation-by-domain.md).
//
// Решение владельца (экзамены — отдельный экран и первый после входа): у
// ученика теперь два своих маршрута — «Задания» и «Занятия» — и та же
// раскладка, что у штата. Роль больше не решает, есть ли навигация вообще —
// только раскладку: боковая колонка (`hasSideNav`) — на широком экране у
// ЛЮБОЙ роли, нижняя панель — на телефоне у любой роли. Колонка сама рисует
// знак школы сверху и блок человека («Профиль»/«Выйти») снизу (AppNav.tsx,
// ADR-0043) — раз колонка есть всегда на широком экране, подвал под
// содержимым (раньше нужный ученику на мониторе, где колонки не было) стал
// недостижим и убран вместе со `showFooter` (CLAUDE.md «Отказались от
// механики — удаляем с концами»).
//
// На телефоне (`!hasSideNav`, у любой роли) колонку заменяет
// AppShellBrandRow.tsx — знак школы и значок профиля первой строкой;
// «Выйти» — на самом экране «Профиль» (ADR-0045), не в оболочке.
//
// Чужой маршрут — редирект, а не подмена экрана: правило «что этой роли
// открыто» и «куда её вести иначе» — canSeeRoute/rootPathFor в
// screenAccess.ts, общее с prefetchFirstScreen.ts и cabinetRoutes.tsx
// (CLAUDE.md «Одна механика — один компонент»). «/profile» и
// «/attempts/:id» — исключения, открытые любой роли (ADR-0045, ТЗ
// student-exams.md).
//
// Статуса «ждёт подтверждения» больше нет (ADR-0036) — вошедший всегда либо
// уже видит свой маршрут, либо гвард (RequireAuth) увёл его на /login раньше,
// чем этот компонент вообще отрисовался.
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { textLinkStyle } from '../components/screenLayout';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppNav } from './AppNav';
import { contentColumnStyle, shellRowStyle, shellStyle } from './appShellStyles';
import { AppShellBrandRow } from './AppShellBrandRow';
import { canSeeRoute, rootPathFor } from './screenAccess';
import { usePrefetchRoutes } from './usePrefetchRoutes';

const PROFILE_PATH = '/profile';

export function AppShell() {
  const { me } = useAuth();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  // Правило «кому что показать» — screenAccess.ts, общее с
  // prefetchFirstScreen.ts и cabinetRoutes.tsx (CLAUDE.md «Одна механика —
  // один компонент»).
  const canSee = canSeeRoute(me, pathname);
  // Сюда добираются уже с подтверждённой сессией (RequireAuth выше) и
  // нарисованным первым экраном — самое время дотянуть остальные разделы в
  // простое браузера, чтобы переход по меню не ждал сети.
  usePrefetchRoutes(me);

  // Боковая колонка — у любой роли на широком экране (см. шапку файла); от
  // неё зависит, кто рисует знак школы и блок человека.
  const hasSideNav = !isMobile;

  return (
    <div style={shellStyle}>
      <div style={shellRowStyle}>
        {hasSideNav && (
          <AppNav
            isMobile={false}
            me={me}
            profileLink={
              <Link to={PROFILE_PATH} style={textLinkStyle}>
                Профиль
              </Link>
            }
            logoutButton={<LogoutButton />}
          />
        )}
        <div style={contentColumnStyle}>
          {!hasSideNav && <AppShellBrandRow isMobile={isMobile} />}
          <main>{canSee ? <Outlet /> : <Navigate to={rootPathFor(me)} replace />}</main>
        </div>
      </div>

      {isMobile && <AppNav isMobile me={me} />}
    </div>
  );
}
