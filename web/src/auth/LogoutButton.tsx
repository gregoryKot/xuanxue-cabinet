// Кнопка «Выйти» вместе с текстом ошибки — один компонент в подвале
// AppShell.tsx, общем для учителя и ученика (CLAUDE.md «Одна механика — один
// компонент»). Сама логика выхода — useLogout.
import { useLogout } from './useLogout';
import { Button } from '../components/Button';

export function LogoutButton() {
  const { pending, error, logout } = useLogout();

  return (
    <>
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <Button variant="secondary" pending={pending} onClick={() => void logout()}>
        Выйти
      </Button>
    </>
  );
}
