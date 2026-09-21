// Ссылка и пароль Zoom «на этот раз» — разовое переопределение ссылки
// занятия расписания для одной даты (что уйдёт в рассылку, если оставить
// пустым, объясняет inheritedZoom.ts). Вынесены из LessonFormFields.tsx
// отдельным файлом, чтобы освободить в нём место под полем тегов: сама форма
// стоит вплотную к потолку храповика размера файла (CLAUDE.md «Файлы»,
// scripts/check-file-size-ratchet.mjs).
import { Field, inputStyle } from '../components/Field';

const LINK_LABEL = 'Ссылка Zoom на это занятие';
const PASSWORD_LABEL = 'Пароль Zoom на это занятие';

// Имена пропов без суффикса Override — здесь он и так подразумевается всем
// компонентом (шапка файла); значение и обработчик приходят из
// zoomLinkOverride/zoomPasswordOverride формы, вызывающая сторона это знает.
interface LessonZoomFieldsProps {
  zoomLink: string;
  zoomPassword: string;
  onChangeZoomLink: (value: string) => void;
  onChangeZoomPassword: (value: string) => void;
  /** Что реально уйдёт в рассылку, если ссылку здесь не переопределять —
   * inheritedZoomHint() считает вызывающая сторона (LessonFormFields.tsx),
   * ей нужен весь список занятий расписания, этому компоненту — нет. */
  hint: string;
}

export function LessonZoomFields({
  zoomLink,
  zoomPassword,
  onChangeZoomLink,
  onChangeZoomPassword,
  hint,
}: LessonZoomFieldsProps) {
  return (
    <>
      <Field label={LINK_LABEL} hint={hint}>
        <input
          style={inputStyle}
          value={zoomLink}
          onChange={(e) => onChangeZoomLink(e.target.value)}
          placeholder="https://…"
        />
      </Field>
      <Field label={PASSWORD_LABEL}>
        <input
          style={inputStyle}
          value={zoomPassword}
          onChange={(e) => onChangeZoomPassword(e.target.value)}
        />
      </Field>
    </>
  );
}
