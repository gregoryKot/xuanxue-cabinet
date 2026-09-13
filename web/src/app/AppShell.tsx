// Оболочка кабинета — шапка, навигация и подвал (CLAUDE.md «Мобильный экран
// первым»). Пунктов навигации четыре, список — navItems.ts, сама навигация в
// двух видах — AppNav.tsx: на телефоне нижняя панель, на широком экране
// колонка слева (docs/adr/0025-navigation-by-domain.md).
//
// В шапке только название школы. «Выйти» — в подвале под содержимым: кнопка
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
import type { CSSProperties } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { LogoutButton } from '../auth/LogoutButton';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppNav } from './AppNav';
import { StudentScreen } from './StudentScreen';

const TEACHER_ROLES = new Set(['teacher', 'assistant', 'admin']);
const NOTIFICATIONS_PATH = '/notifications';
const ATTEMPT_PATH_PREFIX = '/attempts/';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  background: '#fff',
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
  const isTeacher = me?.roles.some((role) => TEACHER_ROLES.has(role)) ?? false;
  const showOutlet =
    isTeacher ||
    pathname === NOTIFICATIONS_PATH ||
    pathname.startsWith(ATTEMPT_PATH_PREFIX);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={headerStyle}>
        <span style={{ fontWeight: 600 }}>Кабинет школы Сюань-Сюэ</span>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {isTeacher && !isMobile && <AppNav isMobile={false} me={me} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            {showOutlet ? <Outlet /> : <StudentScreen />}
          </div>
          <footer style={footerStyle}>
            <span>Вы вошли как {me?.name ?? '—'} ·</span>
            <Link to={NOTIFICATIONS_PATH}>Уведомления</Link>
            <span>·</span>
            <LogoutButton />
          </footer>
        </div>
      </div>

      {isTeacher && isMobile && <AppNav isMobile me={me} />}
    </div>
  );
}
