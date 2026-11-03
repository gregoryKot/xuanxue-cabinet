// Секция режима на «Профиле»: «Режим ученика» (ADR-0163) — у штата, «Режим
// учителя» (ADR-0190) — у разработчика. Показывать её или нет, решает вызывающий
// по `me.canUseStudentMode` / `me.canUseTeacherMode`: флаг считает сервер, по
// `roles` в режиме не вывести. Стоит у самого «Выйти», отдельным блоком: это инструмент
// проверки, не личная настройка. Объяснение живёт здесь же, до кнопки
// (CLAUDE.md «Каждая фича объясняет»): человек должен заранее знать, что
// изменится, а что останется как было.
//
// Кнопка вторая по силе, не заливка: на экране уже есть главное действие
// («Сохранить» имя), терракота одна на экран (docs/adr/0031).
import type { CSSProperties } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { ACTING_MODES, DISABLE_LABEL, type ActingMode } from './actingModes';
import { useActingMode } from './useActingMode';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headingStyle: CSSProperties = { margin: 0 };
const errorStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };
const buttonStyle: CSSProperties = { alignSelf: 'flex-start' };

export function ActingModeSection({ me, mode }: { me: MeDto; mode: ActingMode }) {
  const { pending, error, set } = useActingMode(mode);
  const spec = ACTING_MODES[mode];
  const isOn = spec.isOn(me);

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {spec.sectionTitle}
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={isOn ? spec.onText : spec.offText} />
      </p>
      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      <Button
        variant="secondary"
        pending={pending}
        onClick={() => void set(!isOn)}
        style={buttonStyle}
      >
        {isOn ? DISABLE_LABEL : spec.enableLabel}
      </Button>
    </section>
  );
}
