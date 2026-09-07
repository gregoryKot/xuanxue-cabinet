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
