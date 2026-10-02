// Секция «Режим ученика» на «Профиле» (ADR-0163) — только у штата
// (`me.canUseStudentMode`, его считает сервер: по `roles` в режиме не вывести,
// они пустые). Стоит у самого «Выйти», отдельным блоком: это инструмент
// проверки, не личная настройка. Объяснение живёт здесь же, до кнопки
// (CLAUDE.md «Каждая фича объясняет»): человек должен заранее знать, что
// изменится, а что останется штатным.
//
// Кнопка вторая по силе, не заливка: на экране уже есть главное действие
// («Сохранить» имя), терракота одна на экран (docs/adr/0031).
import type { CSSProperties } from 'react';
import type { MeDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { RichText } from '../components/RichText';
import { screenExplanationStyle } from '../components/screenLayout';
import { useStudentMode } from './useStudentMode';

const TITLE = 'Режим ученика';
const OFF_TEXT =
  'Кабинет покажет вам экраны, меню и уведомления о занятиях, как у ученика. **Бот и оповещения о сбоях** остаются как были.';
const ON_TEXT =
  'Сейчас кабинет показывает вам экраны и уведомления ученика. **Роль сохранена** — она вернётся, когда вы выйдете из режима.';
const ENABLE_LABEL = 'Включить режим ученика';
const DISABLE_LABEL = 'Вернуться к своей роли';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headingStyle: CSSProperties = { margin: 0 };
const errorStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };
const buttonStyle: CSSProperties = { alignSelf: 'flex-start' };

export function StudentModeSection({ me }: { me: MeDto }) {
  const { pending, error, set } = useStudentMode();
  const isOn = me.studentMode;

  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {TITLE}
      </h2>
      <p style={screenExplanationStyle}>
        <RichText text={isOn ? ON_TEXT : OFF_TEXT} />
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
        {isOn ? DISABLE_LABEL : ENABLE_LABEL}
      </Button>
    </section>
  );
}
