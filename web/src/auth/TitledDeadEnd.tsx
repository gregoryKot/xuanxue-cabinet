// Экран-тупик с одним выходом: битая ссылка (email, Google) или отменённый
// вход через Google. Общий кусок EmailLoginCallbackScreen.tsx и
// GoogleLoginCallbackScreen.tsx (CLAUDE.md «Одна механика — один компонент»,
// jscpd).
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';
import { postLoginPath } from './returnTo';

const fullWidthStyle = { width: '100%' };
const DEFAULT_BUTTON_LABEL = 'На страницу входа';

interface TitledDeadEndProps {
  title: string;
  message: string;
  buttonLabel?: string;
  /** Привязка Google (ADR-0145) начинается уже вошедшим человеком: тупик,
   * пойманный на этом пути (отменённый выбор аккаунта, битая ссылка),
   * возвращает его туда, откуда он пришёл (сохранённый путь или домашний
   * экран), а не гонит на страницу входа, где ему нечего делать. По
   * умолчанию — false: email- и обычный google-вход всегда идут без
   * сессии. */
  hasSession?: boolean;
}

export function TitledDeadEnd({
  title,
  message,
  buttonLabel = DEFAULT_BUTTON_LABEL,
  hasSession = false,
}: TitledDeadEndProps) {
  const navigate = useNavigate();

  function handleClick(): void {
    void navigate(hasSession ? postLoginPath() : '/login');
  }

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{title}</h1>
      <p role="alert" style={screenExplanationStyle}>
        {message}
      </p>
      {/* Контур, не заливка терракотой: тупик с одним выходом, не главное
          действие экрана (docs/adr/0031). */}
      <Button variant="secondary" onClick={handleClick} style={fullWidthStyle}>
        {buttonLabel}
      </Button>
    </EntryColumn>
  );
}
