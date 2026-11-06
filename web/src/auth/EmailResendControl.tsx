// «Отправить ещё раз» под формой кода (EmailLoginForm.tsx): пока окно
// cooldown не прошло, ссылки нет — сервер в нём всё равно не шлёт письма, а
// отвечает тем же 204 (аудит 2026-10-01, F30), виден только отсчёт. Вынесен
// из EmailLoginForm.tsx, чтобы тот остался в пределах файла-храповика, когда
// к нему добавился отказ 403 (LoginRefusedNotice.tsx).
import { RichText } from '../components/RichText';
import { screenHintStyle } from '../components/screenLayout';
import { TextLinkButton } from '../components/TextLinkButton';
import { buildResendCountdownText } from './emailResendCountdown';

/** Под ссылкой повтора, когда окно cooldown прошло (F30): сервер заменяет
 * заявку новой, и код из первого письма перестаёт подходить — ученик,
 * дождавшийся первого письма после повтора, иначе получал «Код не подошёл»
 * без объяснения. */
const RESEND_REPLACES_CODE_MESSAGE = 'Код из прежнего письма перестанет работать.';

interface EmailResendControlProps {
  /** Секунд до повторной отправки; 0 — слать можно. */
  resendAvailableInSec: number;
  pending: boolean;
  onResend: () => void;
}

export function EmailResendControl({
  resendAvailableInSec,
  pending,
  onResend,
}: EmailResendControlProps) {
  if (resendAvailableInSec > 0) {
    return (
      <p style={screenHintStyle}>
        <RichText text={buildResendCountdownText(resendAvailableInSec)} />
      </p>
    );
  }

  // Текстовая ссылка, а не кнопка: повтор отправки — действие второго
  // плана, контурная кнопка во всю ширину звала бы нажать её первой
  // (docs/adr/0031).
  return (
    <>
      <TextLinkButton disabled={pending} onClick={onResend}>
        Отправить ещё раз
      </TextLinkButton>
      <p style={screenHintStyle}>{RESEND_REPLACES_CODE_MESSAGE}</p>
    </>
  );
}
