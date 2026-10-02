// Сверка реестра миграций без Mongo. 2026-10-02 две ветки независимо взяли
// номер 0019 (`full-school-schedule` и `payment-contact-with-channel`). Поймал
// конфликт git в соседних строках реестра, а встань записи в разные места —
// два «0019» уехали бы в main молча. Совпавший `id` хуже: раннер счёл бы
// вторую миграцию уже применённой и пропустил бы её навсегда.
import { MIGRATIONS } from './migrations';

// Номер — четыре цифры в начале `id`, как у имени файла.
const NUMBER_RE = /^(\d{4})-/;

function numberOf(id: string): string | undefined {
  return NUMBER_RE.exec(id)?.[1];
}

describe('реестр миграций', () => {
  const ids = MIGRATIONS.map((m) => m.id);

  it('у каждой миграции id начинается с четырёхзначного номера', () => {
    const withoutNumber = ids.filter((id) => numberOf(id) === undefined);
    expect(withoutNumber).toEqual([]);
  });

  it('id не повторяются — иначе раннер пропустит вторую как применённую', () => {
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('номера не повторяются — занятый номер берёт следующий свободный', () => {
    const numbers = ids.map(numberOf);
    const duplicates = numbers.filter((n, i) => numbers.indexOf(n) !== i);
    expect(duplicates).toEqual([]);
  });
});
