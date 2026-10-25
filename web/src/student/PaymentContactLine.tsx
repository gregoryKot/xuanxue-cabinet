// Фраза «Отправьте скриншот об оплате {контакт}.» — кому присылать снимок
// перевода (ADR-0159). Одна на «Профиль» (PaymentContactNote.tsx) и «Доску»
// (board/BoardPaymentCard.tsx, ADR-0173): вторая копия строки разошлась бы в
// словах и в том, как ник в контакте становится ссылкой.
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';

interface PaymentContactLineProps {
  contact: string;
}

export function PaymentContactLine({ contact }: PaymentContactLineProps) {
  return (
    <p style={screenExplanationStyle}>
      {/* Без `**` вокруг контакта: ник внутри него ссылка, а ссылка сама
          выделена; акцент разрывался бы на непарные маркеры. */}
      <RichText text={`Отправьте скриншот об оплате ${contact}.`} />
    </p>
  );
}
