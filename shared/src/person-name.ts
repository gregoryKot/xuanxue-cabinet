// Имя человека в кабинете: в базе одно поле `name`, в форме первого входа —
// два (ADR-0044). Склейка и разбор живут здесь, а не по разу в api и в web
// (CLAUDE.md «Слои», «Одна механика — один компонент»): иначе экран первого
// входа и вход через Telegram разойдутся в том, где кончается имя и
// начинается фамилия.

/**
 * Имя человека, который вошёл по ссылке на почту и ещё не назвался:
 * аккаунт заводится в момент входа (LoginIdentityService), а имя он вводит
 * экраном позже. Раньше на этом месте стоял сам адрес почты — он попадал и
 * в список «Ученики», и в приветствие, хотя ключи входа наружу нарочно не
 * отдаются (SECURITY §1, user.mapper.ts).
 */
export const NEW_PERSON_NAME = 'Новый ученик';

/** Потолок одного поля формы первого входа — и в DTO (`@MaxLength`), и в
 * `maxLength` самого поля ввода. 60 знаков: длиннее не бывает ни имени, ни
 * фамилии, а строка списка «Ученики» на 360 px столько уже не показывает. */
export const PERSON_NAME_PART_MAX = 60;

export interface PersonNameParts {
  firstName: string;
  lastName: string;
}

/**
 * Имя и фамилия → отображаемое `name`. Пустая фамилия исчезает вместе с
 * пробелом-разделителем — так же, как пустая подстановка в шаблонах постов
 * (ADR-0011).
 */
export function joinPersonName(firstName: string, lastName?: string): string {
  return [firstName, lastName]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

/**
 * Отображаемое `name` → поля формы: всё до первого пробела — имя, остальное
 * фамилия («Анна Мария Петрова» → «Анна» + «Мария Петрова»). Так разбирается
 * обратно то, что склеил `joinPersonName` из Telegram-идентичности, и форма
 * первого входа открывается заполненной, а не пустой.
 *
 * `NEW_PERSON_NAME` — не имя, а заглушка: разбирать её на «Новый» и «ученик»
 * значило бы предложить человеку подтвердить то, чего он не вводил.
 */
export function splitPersonName(name: string): PersonNameParts {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === NEW_PERSON_NAME) {
    return { firstName: '', lastName: '' };
  }
  const space = trimmed.indexOf(' ');
  if (space === -1) return { firstName: trimmed, lastName: '' };
  return {
    firstName: trimmed.slice(0, space),
    lastName: trimmed.slice(space + 1).trim(),
  };
}

/**
 * Тело `PATCH /me/profile` — человек называет себя сам на первом входе
 * (ADR-0044). Фамилия необязательна: спрашиваем один раз и не держим
 * человека на экране из-за поля, которое он не хочет заполнять (CLAUDE.md
 * «Ноль нагрузки на ученика»).
 */
export interface UpdateMyProfileInput {
  firstName: string;
  lastName?: string;
}
