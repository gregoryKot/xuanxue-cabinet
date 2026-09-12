// Оболочка кабинета — шапка и навигация (CLAUDE.md «Мобильный экран первым»).
// Пунктов навигации три, список — navItems.ts, сама навигация в двух видах —
// AppNav.tsx: на телефоне нижняя панель, на широком экране колонка слева.
//
// В шапке только название школы. «Выйти» переехало в «Настройки» (у учителя)
// и на экран ученика: кнопка висела в шапке на каждом экране, хотя нужна раз
// в жизни (отзыв владельца 2026-09-12). Роль без teacher/admin (ученик) —
// StudentScreen вместо содержимого маршрута.
import type { CSSProperties } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppNav } from './AppNav';
import { StudentScreen } from './StudentScreen';

const TEACHER_ROLES = new Set(['teacher', 'admin']);

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  background: '#fff',
};

export function AppShell() {
  const { me } = useAuth();
  const isMobile = useIsMobile();
  const isTeacher = me?.roles.some((role) => TEACHER_ROLES.has(role)) ?? false;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={headerStyle}>
        <span style={{ fontWeight: 600 }}>Кабинет школы Сюань-Сюэ</span>
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {isTeacher && !isMobile && <AppNav isMobile={false} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isTeacher ? <Outlet /> : <StudentScreen />}
        </div>
      </div>

      {isTeacher && isMobile && <AppNav isMobile />}
    </div>
  );
}
