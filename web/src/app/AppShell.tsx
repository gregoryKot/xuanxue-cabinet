// Оболочка кабинета — шапка и навигация (CLAUDE.md «Мобильный экран первым»).
// Пункты навигации появляются вместе с экраном, который открывают (PR K, по
// одному на патч) — список в navItems.ts; сама навигация в двух видах —
// AppNav.tsx. На широком экране она уходит в колонку слева, а содержимое
// живёт в колонке ограниченной ширины: телефонный макет во всю ширину
// монитора растягивал карточку с одной строкой текста на 1400 пикселей
// (отзыв владельца 2026-09-09). Роль без teacher/admin (ученик) —
// StudentScreen вместо содержимого маршрута, но шапка с «Выйти» остаётся.
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { useIsMobile } from '../hooks/useIsMobile';
import { AppNav } from './AppNav';
import { StudentScreen } from './StudentScreen';

const TEACHER_ROLES = new Set(['teacher', 'admin']);

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '12px 16px',
  borderBottom: '1px solid var(--border)',
  background: '#fff',
};

const LOGOUT_FAILED_MESSAGE = 'Не удалось выйти. Попробуйте ещё раз.';

export function AppShell() {
  const navigate = useNavigate();
  const { me, clear } = useAuth();
  const isMobile = useIsMobile();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTeacher = me?.roles.some((role) => TEACHER_ROLES.has(role)) ?? false;

  async function handleLogout() {
    setPending(true);
    setError(null);
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
      clear();
      void navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : LOGOUT_FAILED_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={headerStyle}>
        <span style={{ fontWeight: 600 }}>Кабинет школы Сюань-Сюэ</span>
        <Button variant="secondary" pending={pending} onClick={() => void handleLogout()}>
          Выйти
        </Button>
      </header>

      {error && (
        <p role="alert" style={{ margin: '8px 16px 0', color: 'var(--danger)' }}>
          {error}
        </p>
      )}

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
