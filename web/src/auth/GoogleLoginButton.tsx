// Кнопка «Войти через Google» — второй способ входа после Telegram (ADR-0145).
// Вторичный силуэт (variant="secondary"): заливка терракотой зарезервирована
// под главное действие экрана — кнопку Telegram (docs/adr/0043). Клик сразу
// уводит вкладку (googleAuthRedirect.ts) — сервер отвечает результатом уже на
// странице `/login/google` (GoogleLoginCallbackScreen.tsx), не здесь.
import { Button } from '../components/Button';
import { redirectToGoogleAuth } from './googleAuthRedirect';
import { useLeavePending } from './useLeavePending';

interface GoogleLoginButtonProps {
  /** Код ссылки-приглашения (ADR-0030/0036) — JoinScreen.tsx передаёт код
   * из /join/:code, LoginScreen.tsx не передаёт вовсе. */
  inviteCode?: string;
}

export function GoogleLoginButton({ inviteCode }: GoogleLoginButtonProps) {
  // Занята до самого перехода вкладки — тот же хук, что у кнопки Telegram
  // (TelegramLoginSection.tsx): без него двойной клик на медленной сети уводил
  // бы вкладку дважды; возврат «Назад» снимает занятость (useLeavePending.ts).
  const [pending, markLeaving] = useLeavePending();

  function handleClick(): void {
    markLeaving();
    redirectToGoogleAuth(inviteCode);
  }

  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={handleClick}
      style={{ width: '100%' }}
    >
      Войти через Google
    </Button>
  );
}
