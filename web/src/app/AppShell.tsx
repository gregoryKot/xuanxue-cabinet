// Оболочка кабинета — шапка, навигация и подвал (CLAUDE.md «Мобильный экран
// первым»). Пунктов навигации четыре, список — navItems.ts, сама навигация в
// двух видах — AppNav.tsx: на телефоне нижняя панель, на широком экране
// колонка слева (docs/adr/0025-navigation-by-domain.md).
//
// В шапке — знак-печать и название школы, больше ничего. «Выйти» — в подвале под содержимым: кнопка
// нужна раз в жизни, а не на каждом экране (отзыв владельца 2026-09-12).
// Один подвал на обе роли — ученик отдал сюда свою кнопку (StudentScreen.tsx,
// её механику по-прежнему проверяют AppShell.test.tsx и LogoutButton.test.tsx).
// Роль без teacher/assistant/admin (ученик, бухгалтер) — StudentScreen вместо
// содержимого маршрута: у бухгалтера прав пока нет нигде (деньги — этап 3,
// docs/PLAN.md). Исключения — «/notifications» (личная настройка человека,
// ТЗ notifications-web.md) и «/attempts/:id» (экран сдачи, ТЗ
// student-exams.md): оба доступны любой роли, поэтому под них Outlet
// рисуется всегда, даже ученику (в нижнюю навигацию не входят — вход в
// экзамен только кнопкой на StudentExamsSection.tsx, docs/adr/0025).
//
// status: 'invited' (ADR-0026) перекрывает всё это — первый вход ждёт
// подтверждения школы, разделов у него ещё нет ни одного, поэтому
// PendingApprovalScreen встаёт впереди проверки роли и пути, а навигация не
// рисуется вовсе (isTeacher ниже для invited всегда false).
import type { CSSProperties } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { SchoolMark, SCHOOL_NAME } from '../components/SchoolMark';
import { textLinkStyle } from '../components/screenLayout';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppNav } from './AppNav';
import { PendingApprovalScreen } from './PendingApprovalScreen';
import { isPending, isTeacher, showsRouteScreen } from './screenAccess';
import { StudentScreen } from './StudentScreen';
import { usePrefetchRoutes } from './usePrefetchRoutes';

const NOTIFICATIONS_PATH = '/notifications';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 16px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--paper)',
};

const shellTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 21,
  color: 'var(--ink)',
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
  // firstScreenPrefetch.ts (CLAUDE.md «Одна механика — один компонент»).
  const pending = isPending(me);
  const teacherRole = isTeacher(me);
  const showOutlet = showsRouteScreen(me, pathname);
  // Сюда добираются уже с подтверждённой сессией (RequireAuth выше) и
  // нарисованным первым экраном — самое время дотянуть остальные разделы в
  // простое браузера, чтобы переход по меню не ждал сети.
  usePrefetchRoutes(teacherRole);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={headerStyle}>
        <SchoolMark />
        <span style={shellTitleStyle}>{SCHOOL_NAME}</span>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {teacherRole && !isMobile && <AppNav isMobile={false} me={me} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            {pending ? (
              <PendingApprovalScreen />
            ) : showOutlet ? (
              <Outlet />
            ) : (
              <StudentScreen />
            )}
          </div>
          <footer style={footerStyle}>
            <span>Вы вошли как {me?.name ?? '—'} ·</span>
            {/* Ждущему подтверждения ссылка на уведомления никуда не ведёт:
                AppShell рисует ему экран ожидания на любом пути, а API
                закрыт до подтверждения (ADR-0026). */}
            {!pending && (
              <>
                <Link to={NOTIFICATIONS_PATH} style={textLinkStyle}>
                  Уведомления
                </Link>
                <span>·</span>
              </>
            )}
            <LogoutButton />
          </footer>
        </div>
      </div>

      {teacherRole && isMobile && <AppNav isMobile me={me} />}
    </div>
  );
}
