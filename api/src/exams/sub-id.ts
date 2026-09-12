// Приём для субэлементов с необязательным входным `id` (вариант вопроса,
// блок формы экзамена): значение сохраняется как есть, отсутствие — сервис
// генерирует новый ObjectId. Общее место для exam-item-options.ts и
// exam-blocks.ts (CLAUDE.md «одна механика — один компонент») — иначе приём
// разъехался бы по двум файлам одного домена по мере правок.
import { Types } from 'mongoose';

export function keepOrGenerateId(id: string | undefined): string {
  return id ?? new Types.ObjectId().toString();
}
