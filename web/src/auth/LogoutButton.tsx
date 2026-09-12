// Кнопка «Выйти» вместе с текстом ошибки — один компонент на два экрана:
// «Настройки» у учителя и StudentScreen у ученика. Разметка у них была
// одинаковой до символа, включая `role="alert"`, и разъезжаться ей незачем
// (CLAUDE.md «Одна механика — один компонент»). Сама логика выхода — useLogout.
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
