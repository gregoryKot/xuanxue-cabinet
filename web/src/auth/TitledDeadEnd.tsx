// Экран-тупик с одним выходом «На страницу входа»: битая ссылка (email,
// Google) или отменённый вход через Google. Общий кусок
// EmailLoginCallbackScreen.tsx и GoogleLoginCallbackScreen.tsx (CLAUDE.md
// «Одна механика — один компонент», jscpd).
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { EntryColumn } from '../components/EntryColumn';
import { screenExplanationStyle, screenTitleStyle } from '../components/screenLayout';

const fullWidthStyle = { width: '100%' };
const DEFAULT_BUTTON_LABEL = 'На страницу входа';

interface TitledDeadEndProps {
  title: string;
  message: string;
  buttonLabel?: string;
}

export function TitledDeadEnd({
  title,
  message,
  buttonLabel = DEFAULT_BUTTON_LABEL,
}: TitledDeadEndProps) {
  const navigate = useNavigate();

  return (
    <EntryColumn>
      <h1 style={screenTitleStyle}>{title}</h1>
      <p role="alert" style={screenExplanationStyle}>
        {message}
      </p>
      {/* Контур, не заливка терракотой: тупик с одним выходом, не главное
          действие экрана (docs/adr/0031). */}
      <Button
        variant="secondary"
        onClick={() => void navigate('/login')}
        style={fullWidthStyle}
      >
        {buttonLabel}
      </Button>
    </EntryColumn>
  );
}
