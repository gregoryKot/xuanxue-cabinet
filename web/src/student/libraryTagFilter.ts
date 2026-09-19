// Фильтр библиотеки ученика по тегу — локальный, по уже загруженному списку
// (ADR-0058, «Фильтр по тегу только на клиенте»): у ученика один запрос
// `/me/materials`, и весь список — одна страница, второй запрос ради
// фильтра ему не нужен, в отличие от учителя (materials/useMaterials.ts,
// серверный `tag=`). Чистая функция без сети и без DOM (CLAUDE.md «Тесты»).
import type { MyMaterialDto } from '@xuanxue/shared';

/** Пустой тег — «Все» (тот же приём, что у серверного фильтра учителя). */
export function filterMaterialsByTag(
  materials: readonly MyMaterialDto[],
  tag: string,
): MyMaterialDto[] {
  if (!tag) return [...materials];
  return materials.filter((material) => material.tags.includes(tag));
}
