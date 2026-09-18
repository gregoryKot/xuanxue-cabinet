// Имя и контакт строки «Люди» — левая колонка макета 2c-people.html
// (docs/adr/0043). Вынесено из PersonRow.tsx: строка перешагнула порог 150
// строк храповика (CLAUDE.md «Храповики» — «Компонент React больше 150 —
// выноси хуки и подкомпоненты», образец — broadcasts/BroadcastCardActions.tsx).
import type { CSSProperties } from 'react';
import type { UserDto } from '@xuanxue/shared';
import { personContactLine } from './personContactLine';

// minWidth: 0 — без него длинное имя+контакт не сжимаются, а раздвигают
// пилюли/действие за пределы строки на 360px (тот же приём, что и у
// ScreenHeader.tsx titleColumnStyle).
const columnStyle: CSSProperties = { flex: '1 1 160px', minWidth: 0 };
const nameStyle: CSSProperties = { fontSize: 15, fontWeight: 500, color: 'var(--ink)' };
const selfSuffixStyle: CSSProperties = { fontWeight: 400, color: 'var(--ink-soft)' };
const metaStyle: CSSProperties = { marginTop: 2, fontSize: 13, color: 'var(--ink-soft)' };
const SELF_SUFFIX = ' — это вы';
// Приписка рядом со временем входа — растяжкой-заглавными (index.css,
// .xuanxue-status-label): blocked — переключатели PersonActions не откроют
// кабинет, вход отсекает AuthGuard. У активного подписи нет — это обычное
// состояние. Статусов два (ADR-0036).
const STATUS_LABELS: Partial<Record<UserDto['status'], string>> = {
  blocked: 'Доступ закрыт',
};

interface PersonIdentityProps {
  person: UserDto;
  /** Сам вошедший — рядом с именем приписка «— это вы» (SECURITY §2). */
  isSelf: boolean;
}

export function PersonIdentity({ person, isSelf }: PersonIdentityProps) {
  const statusLabel = STATUS_LABELS[person.status];
  return (
    <div style={columnStyle}>
      <div style={nameStyle}>
        {/* Имя — своим `<span>`, только когда рядом приписка «— это вы»:
            иначе строка не сплошной текстовый узел «Маша», а «Маша — это
            вы» целиком, и точный поиск по имени (PeopleScreen.test.tsx)
            перестаёт находить чужую и свою строку одним и тем же образом. */}
        {isSelf ? <span>{person.name}</span> : person.name}
        {isSelf && <span style={selfSuffixStyle}>{SELF_SUFFIX}</span>}
      </div>
      <div style={metaStyle}>
        {personContactLine(person)}
        {statusLabel && (
          <>
            {' · '}
            <span className="xuanxue-status-label">{statusLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
