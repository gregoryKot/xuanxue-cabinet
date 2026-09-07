// Оболочка кабинета — шапка и нижняя навигация (CLAUDE.md «Мобильный экран
// первым»). Пункты навигации появляются вместе с экраном, который открывают
// (PR K, по одному на патч): «Сводка», «Расписание», «Планирование» — дальше
// «Каналы», «Рассылки», «Шаблоны». Роль без teacher/admin (ученик) —
// StudentScreen вместо содержимого маршрута, но шапка с «Выйти» остаётся.
import type { CSSProperties } from 'react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api/http';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
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

const navStyle: CSSProperties = {
  display: 'flex',
  borderTop: '1px solid var(--border)',
  background: '#fff',
};

const navLinkStyle = (isActive: boolean): CSSProperties => ({
  flex: 1,
  textAlign: 'center',
  padding: '12px 8px',
  minHeight: 44,
  textDecoration: 'none',
  color: isActive ? 'var(--accent)' : 'var(--ink-soft)',
  fontWeight: isActive ? 600 : 400,
});

const LOGOUT_FAILED_MESSAGE = 'Не удалось выйти. Попробуйте ещё раз.';

export function AppShell() {
  const navigate = useNavigate();
  const { me, clear } = useAuth();
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

      <div style={{ flex: 1 }}>{isTeacher ? <Outlet /> : <StudentScreen />}</div>

      {isTeacher && (
        <nav style={navStyle} aria-label="Разделы кабинета">
          <NavLink to="/summary" style={({ isActive }) => navLinkStyle(isActive)}>
            Сводка
          </NavLink>
          <NavLink to="/schedule" style={({ isActive }) => navLinkStyle(isActive)}>
            Расписание
          </NavLink>
          <NavLink to="/planning" style={({ isActive }) => navLinkStyle(isActive)}>
            Планирование
          </NavLink>
        </nav>
      )}
    </div>
  );
}
