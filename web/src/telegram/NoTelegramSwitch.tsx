// Отметка «у меня нет Telegram» (ADR-0067) — тихая ссылка второго плана
// рядом с предложением связать Telegram, не Button во всю ширину: правило
// акцента (docs/adr/0031), тот же приём, что «Отправить ещё раз» в
// auth/EmailLoginForm.tsx. Логика — в useNoTelegram.ts (CLAUDE.md «Логика
// вне компонентов»), этот компонент только рендерит по её состоянию и
// решает, какой из двух текстов показать.
import { useAuth } from '../auth/AuthProvider';
import { TextLinkButton } from '../components/TextLinkButton';
import { useNoTelegram } from './useNoTelegram';

const NO_TELEGRAM_LABEL = 'У меня нет Telegram';
const HAS_TELEGRAM_LABEL = 'Telegram у меня появился';
const NO_TELEGRAM_NOTICE = 'Вы сказали, что Telegram у вас нет.';

const wrapStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const textStyle = { margin: 0 };

interface NoTelegramSwitchProps {
  /** Отметка уже стоит — показываем, что предложений больше не будет, и
   * дорогу назад. */
  noTelegram: boolean;
}

export function NoTelegramSwitch({ noTelegram }: NoTelegramSwitchProps) {
  const { applyMe } = useAuth();
  const { pending, error, set } = useNoTelegram(applyMe);

  return (
    <div style={wrapStyle}>
      {noTelegram && <p style={textStyle}>{NO_TELEGRAM_NOTICE}</p>}
      {error && (
        <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>
          {error}
        </p>
      )}
      <TextLinkButton disabled={pending} onClick={() => void set(!noTelegram)}>
        {noTelegram ? HAS_TELEGRAM_LABEL : NO_TELEGRAM_LABEL}
      </TextLinkButton>
    </div>
  );
}
