// Подпись под снимком перевода, который уходит бухгалтеру (ADR-0156). Одна
// функция на оба пути — бот (копия сообщения ученика) и кабинет (байты
// снимка): подпись не должна разъезжаться, «одна механика — один компонент»
// (CLAUDE.md). Имя ученика живёт только здесь и в самом сообщении бухгалтеру:
// в лог оно не идёт (SECURITY §1).
import { formatMonthRu } from '@xuanxue/shared';

export interface PaymentScreenshotCaptionInput {
  studentName: string;
  /** Ключ месяца `YYYY-MM`. */
  month: string;
  /** Снимок за этот месяц уже был — бухгалтеру важно знать, что этот
   * взамен прежнего, а не второй перевод. */
  replaced: boolean;
}

export function paymentScreenshotCaption({
  studentName,
  month,
  replaced,
}: PaymentScreenshotCaptionInput): string {
  const monthRu = formatMonthRu(month);
  return replaced
    ? `Новый скриншот от ${studentName} взамен прежнего — оплата за ${monthRu}.`
    : `Скриншот от ${studentName} — оплата за ${monthRu}.`;
}
