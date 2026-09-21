// Единственное место, где читается отметка «у меня нет Telegram»
// (`MeDto.noTelegram`, ADR-0067). Вопросов про Telegram в кабинете два, а
// отметка одна: «предлагать ли завести чат с ботом» решает showsTelegramOffer
// (признак `botChatActive`, ADR-0042), «предлагать ли Telegram вторым ключом
// входа» — auth/SecondLoginKey.tsx (признак `telegramLinked`, ADR-0059). У
// вошедшего через виджет Telegram `telegramLinked` истинен сразу, а чата с
// ботом нет — свести эти два вопроса в один значило бы предлагать «связать
// Telegram» тому, у кого Telegram и есть ключ входа. Отметка гасит оба
// вопроса разом, и читается она здесь одна на всех: скопированная в два
// места, она разъехалась бы на первой же правке (CLAUDE.md «Одна механика —
// один компонент»).
import type { MeDto } from '@xuanxue/shared';

/** `me === null` — сессия ещё грузится: ничего не предлагаем, чтобы
 * предложение не появлялось вспышкой после загрузки (тот же приём, что у
 * showsTelegramOffer и showsTelegramHint). */
export function acceptsTelegramOffer(me: MeDto | null): boolean {
  if (!me) return false;
  return !me.noTelegram;
}

/** Второй из двух вопросов про Telegram целиком: предлагать ли связать сам
 * аккаунт — «Второй способ входа» (auth/SecondLoginKey.tsx, ADR-0059) и
 * видео-вопрос попытки (attempt/AttemptQuestionVideo.tsx, ADR-0023). Оба
 * смотрят на `telegramLinked`, а не на `botChatActive`, и оба обязаны гаснуть
 * отметкой — пара условий здесь одна на двоих: своя копия у видео-вопроса и
 * оставила его единственным местом, где кабинет звал в Telegram отметившегося
 * (ADR-0067 обещает «на всех экранах сразу»). */
export function showsTelegramLinkOffer(me: MeDto | null): boolean {
  if (!me) return false;
  return acceptsTelegramOffer(me) && !me.telegramLinked;
}
