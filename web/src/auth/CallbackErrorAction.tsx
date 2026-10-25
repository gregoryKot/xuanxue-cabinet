// Что показать под ошибкой callback-входа (email, Google): 403 — приписка
// про ссылку-приглашение (повтор тем же способом упрётся в тот же отказ,
// кнопка не нужна), иначе — кнопка с действием, которое чинит остальные
// ошибки (сеть, устаревшая ссылка). Общий блок EmailLoginCallbackScreen.tsx и
// GoogleLoginCallbackScreen.tsx (CLAUDE.md «Одна механика — один компонент»).
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { INVITE_HINT_MESSAGE } from './inviteHintMessage';
import { loginPath, postLoginPath } from './returnTo';

const FORBIDDEN_STATUS = 403;
const fullWidthStyle = { width: '100%' };

interface CallbackErrorActionProps {
  errorStatus: number | null;
  /** Подпись кнопки для не-403 ошибок: «Запросить новую» (email — новая
   * ссылка решает и устаревший токен), «На страницу входа» (Google-вход) или
   * «Вернуться» (Google-привязка уже вошедшего, `hasSession` ниже). */
  buttonLabel: string;
  /** См. TitledDeadEnd.tsx — тот же приём: привязка Google уже вошедшим
   * человеком ведёт кнопку назад в кабинет, не на страницу входа. */
  hasSession?: boolean;
}

export function CallbackErrorAction({
  errorStatus,
  buttonLabel,
  hasSession = false,
}: CallbackErrorActionProps) {
  const navigate = useNavigate();

  if (errorStatus === FORBIDDEN_STATUS) {
    return (
      <p style={screenExplanationStyle}>
        <RichText text={INVITE_HINT_MESSAGE} />
      </p>
    );
  }

  function handleClick(): void {
    void navigate(hasSession ? postLoginPath() : loginPath());
  }

  return (
    <Button variant="secondary" onClick={handleClick} style={fullWidthStyle}>
      {buttonLabel}
    </Button>
  );
}
