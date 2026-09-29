// Привязка Google к профилю (ADR-0145) — «Профиль» → «Привязать Google»,
// второй путь входа наравне с Telegram/почтой (SecondLoginKey.tsx рядом),
// но отдельным блоком: Google не встаёт на их место (можно войти и через
// Telegram, и через почту, и через Google сразу), не заменяет один из двух.
// Показывается только пока Google не привязан (привязанный — строка в
// LoginKeysSummary.tsx) и когда сервер разрешает Google (`config.googleLoginEnabled`,
// та же оговорка, что у GoogleLoginButton.tsx на экране входа) — без него
// кнопка звала бы 503. Клик сразу уводит вкладку (`redirectToGoogleLink`),
// как GoogleLoginButton.tsx: Google не выдаёт код на связку заранее, в
// отличие от Telegram (TelegramLinkButton.tsx, useTelegramLinkCode.ts) —
// сервер решает «вход это или привязка» уже на возврате, по своей cookie
// состояния (GoogleLoginCallbackScreen.tsx).
import { useState } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { useAuthConfig } from './useAuthConfig';
import { redirectToGoogleLink } from './googleAuthRedirect';

// ≥80 знаков — акцент по правилу (docs/VOICE.md, ADR-0124): факт, ради
// которого блок вообще существует.
const EXPLANATION =
  'Второй путь входа на случай, если потеряете доступ к Telegram или почте — ' +
  '**можно будет войти через Google**.';
const BUTTON_LABEL = 'Привязать Google';

const sectionStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };

interface GoogleLinkSectionProps {
  me: MeDto;
}

export function GoogleLinkSection({ me }: GoogleLinkSectionProps) {
  const [pending, setPending] = useState(false);
  const { config, status: configStatus } = useAuthConfig();

  // Привязанному Google предлагать нечего: «привязан» теперь говорит сводка
  // LoginKeysSummary.tsx, вторая строка про то же была бы дублем. Не
  // предлагаем и когда школа выключила вход через Google конфигурацией — без
  // него кнопка звала бы 503.
  if (me.googleLinked) return null;
  if (configStatus !== 'ok' || !config?.googleLoginEnabled) return null;

  function handleClick(): void {
    setPending(true);
    redirectToGoogleLink();
  }

  return (
    <section style={sectionStyle}>
      <p style={screenExplanationStyle}>
        <RichText text={EXPLANATION} />
      </p>
      <Button
        variant="secondary"
        pending={pending}
        onClick={handleClick}
        style={{ alignSelf: 'flex-start' }}
      >
        {BUTTON_LABEL}
      </Button>
    </section>
  );
}
