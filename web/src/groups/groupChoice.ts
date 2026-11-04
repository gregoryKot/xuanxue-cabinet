// Значения радио «Группа» (ADR-0195): отдельный модуль без React, чтобы чистая
// логика форм (schedule/classFormInput.ts, channels/channelFormInput.ts) брала
// их, не втягивая компонент.

/** «Группа не выбрана» — пустая строка, обычная строка списка радио. */
export const NO_GROUP_CHOICE = '';
/** «Все группы» у занятия: не id группы, поэтому не пересечётся с ним. */
export const ALL_GROUPS_CHOICE = '__all__';
