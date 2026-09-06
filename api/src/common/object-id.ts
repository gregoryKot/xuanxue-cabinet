// `id` из пути — просто строка (SECURITY §3): прежде чем отдать её в Mongo,
// сервис обязан отсеять заведомо невалидный ObjectId — иначе Mongoose бросает
// CastError, который улетает как 500, а не как понятный 404. Раньше каждый
// сервис дублировал `if (!Types.ObjectId.isValid(id)) throw ...` (classes,
// channels — по три места каждый, lessons — свою обёртку) — один код, чтобы
// проверка не разошлась между ними.
import { Types } from 'mongoose';
import { NotFoundError } from './errors';

export function assertObjectId(id: string, notFoundMessage: string): void {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundError(notFoundMessage);
}
