// Гонка «запись × удаление» в спеке на настоящей Mongo: перед ОДНИМ ближайшим
// вызовом метода модели выполнить `hook` (например, снести документ чужим
// путём), потом пропустить вызов как есть. Так воспроизводится окно между
// двумя запросами сервиса без setTimeout и без порядка тестов (CLAUDE.md
// «Детерминизм»). Приём из аудита 2026-10-01 (F28), общий для спеков.
import type { Model } from 'mongoose';

type ModelMethod = 'updateOne' | 'findOneAndUpdate' | 'create';
type Callable = (...args: unknown[]) => unknown;

export function beforeModelCall<T>(
  model: Model<T>,
  method: ModelMethod,
  hook: () => Promise<void>,
): void {
  // Перегрузки mongoose не дают spyOn типизированно обернуть метод — для
  // подмены достаточно «что-то вызываемое с теми же аргументами».
  const target = model as unknown as Record<ModelMethod, Callable>;
  const original = target[method].bind(model);
  jest
    .spyOn(target, method)
    .mockImplementationOnce((...args) => hook().then(() => original(...args)));
}
