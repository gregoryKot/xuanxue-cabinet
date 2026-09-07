// Приписка «· пояс» на карточке слота — только если пояс занятия отличается
// от браузерного (docs/PLAN.md §3: у занятия свой пояс, у пользователя —
// свой из профиля/браузера). Сравнение по имени IANA-зоны, не по смещению:
// смещение плавает с переходом на летнее время, имя — нет.
function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function tzBadge(
  classTz: string,
  browserTimeZone: string = browserTz(),
): string | null {
  return classTz === browserTimeZone ? null : classTz;
}
