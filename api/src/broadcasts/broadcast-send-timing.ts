// Момент фактической отправки рассылки-ссылки на занятие и момент, на который
// рендерится её текст — общая арифметика планировщика (sendLessonBroadcast,
// broadcast-planner.send.ts) и пересборки после переноса занятия или смены
// темы (LessonLinkRebuildService.rebuild, lesson-link-rebuild.service.ts):
// одна функция, не копия формулы в двух файлах (CLAUDE.md «Одна механика —
// один компонент», гейт jscpd).
import { DateTime } from 'luxon';

export interface BroadcastSendTiming {
  /** `startsAt` минус `leadMinutes` класса — момент, когда рассылка должна
   * реально уйти, а не момент создания или пересборки документа. */
  sendAt: DateTime;
  /** `sendAt`, если он ещё в будущем, иначе `now`. Текст «через {минут}»
   * рендерится на этот момент — иначе догоняющий тик (sendAt уже в прошлом)
   * или перенос занятия на более раннее время написали бы в посте то, что к
   * моменту отправки уже неправда. */
  textNow: DateTime;
}

export function computeBroadcastSendTiming(
  startsAt: Date,
  leadMinutes: number,
  now: DateTime,
): BroadcastSendTiming {
  const sendAt = DateTime.fromJSDate(startsAt, { zone: 'utc' }).minus({
    minutes: leadMinutes,
  });
  return { sendAt, textNow: sendAt > now ? sendAt : now };
}
