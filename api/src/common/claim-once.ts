// Условный апдейт «поставить {field} = now, если поля ещё нет» — общий для
// PreviewService/RecordingPromptService/ManualPromptService (CLAUDE.md «Одна
// механика — один компонент»): раньше три сервиса дублировали один и тот же
// updateOne под разным именем поля (previewSentAt/recordingPromptedAt/
// manualPromptedAt). `modifiedCount === 1` — этот вызов «забрал» документ,
// второй тик/инстанс увидит поле уже занятым и не пришлёт дубль.
import type { DateTime } from 'luxon';
import type { Model, QueryFilter, Types } from 'mongoose';

export async function claimOnce<T>(
  model: Model<T>,
  id: Types.ObjectId,
  field: string,
  now: DateTime,
): Promise<boolean> {
  // Имя поля — параметром (три вызывающих сервиса, три разных поля), поэтому
  // фильтр/апдейт не выражаются типизированным `QueryFilter<T>`/`UpdateQuery<T>`
  // напрямую — тот же приём, что `Record<string, unknown>` в lessons.service.ts
  // (splitUpdate), просто оформленный как cast на настоящий тип, не `any`.
  const filter: Record<string, unknown> = { _id: id, [field]: { $exists: false } };
  const update: Record<string, unknown> = { $set: { [field]: now.toJSDate() } };
  const { modifiedCount } = await model.updateOne(filter as QueryFilter<T>, update);
  return modifiedCount === 1;
}

// Снимает отметку обратно (аудит 2026-09-21, HIGH). claimOnce ставит
// {field} ДО побочного эффекта — если эффект между claim и своим концом
// падает (сетевой блип к Mongo и что угодно ещё), отметка без releaseClaim
// осталась бы стоять навсегда: следующий тик документ не увидит, доставка/
// уведомление потеряются без следа. `$unset` — не «поставить false»: поле в
// схемах объявлено как «нет = не отправляли», значение должно либо стоять
// датой, либо отсутствовать.
export async function releaseClaim<T>(
  model: Model<T>,
  id: Types.ObjectId,
  field: string,
): Promise<void> {
  const filter: Record<string, unknown> = { _id: id };
  const update: Record<string, unknown> = { $unset: { [field]: '' } };
  await model.updateOne(filter as QueryFilter<T>, update);
}

// Общая механика для всех четырёх циклов, которые сейчас держат claimOnce
// (ManualPromptService/BroadcastCancelNotifyService/PreviewService/
// RecordingPromptService) — тот же уровень, что у DeliveryRunnerService.run():
// там каждый элемент цикла в своём try/catch, здесь эффект между claim и
// концом работы тоже должен быть изолирован от соседей и от падения без
// возврата claim'а (CLAUDE.md «Одна механика — один компонент», аудит
// 2026-09-21). Не забрали документ — false. Забрали и `work()` упал —
// `onError` логирует (вызывающий сервис знает свой текст и id), claim
// снимается и функция возвращает false: следующий тик увидит документ
// свободным и попробует снова. `.catch(() => null)` у releaseClaim — если
// снятие claim'а тоже упадёт (тот же сетевой блип), ошибка уже залогирована
// выше и не должна прервать остаток цикла вызывающего сервиса.
export async function claimAndRun<T>(
  model: Model<T>,
  id: Types.ObjectId,
  field: string,
  now: DateTime,
  work: () => Promise<boolean>,
  onError: (error: unknown) => void,
): Promise<boolean> {
  if (!(await claimOnce(model, id, field, now))) return false;
  try {
    return await work();
  } catch (error) {
    onError(error);
    await releaseClaim(model, id, field).catch(() => null);
    return false;
  }
}
