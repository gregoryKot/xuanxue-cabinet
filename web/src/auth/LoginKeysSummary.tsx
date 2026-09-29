// Сводка «Способы входа» на «Профиле»: какая почта привязана и какие ключи
// входа есть у аккаунта. Баг владельца 2026-09-29: адрес нигде не был назван,
// и владелец не понял, почему вход через Google с «той же почтой» его не
// узнал. Google узнаёт аккаунт по `googleId` или по подтверждённому
// `users.email` — без названного адреса причину не увидеть.
//
// Отдельный компонент, а SecondLoginKey и GoogleLinkSection остаются
// предложениями («одна механика — один компонент»): сводка только показывает,
// что есть, а предлагают и привязывают они. Ждущий подтверждения адрес здесь
// не дублируется — его уже показывает PendingEmailNotice внутри SecondLoginKey.
import type { CSSProperties } from 'react';
import type { MeDto } from '@xuanxue/shared';

const TITLE = 'Способы входа';
const EMAIL_LABEL = 'Почта';
const TELEGRAM_LABEL = 'Telegram';
const GOOGLE_LABEL = 'Google';
const EMAIL_MISSING = 'не привязана';
const KEY_LINKED = 'привязан';
const KEY_MISSING = 'нет';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const headingStyle: CSSProperties = { margin: 0 };
// `auto 1fr`: подпись по своей ширине, значение занимает остальное и
// переносится, а не распирает экран на 360 px.
const listStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: 16,
  rowGap: 8,
  margin: 0,
};
const labelStyle: CSSProperties = { color: 'var(--ink-soft)' };
const valueStyle: CSSProperties = { margin: 0, overflowWrap: 'anywhere' };

export interface LoginKeyRow {
  label: string;
  value: string;
}

/** Что показать в каждой строке. Ждущий подтверждения адрес — не ключ входа
 * (SECURITY §2), поэтому «Почта» без `email` остаётся «не привязана». */
export function loginKeyRows(me: MeDto): LoginKeyRow[] {
  return [
    { label: EMAIL_LABEL, value: me.email ?? EMAIL_MISSING },
    { label: TELEGRAM_LABEL, value: me.telegramLinked ? KEY_LINKED : KEY_MISSING },
    { label: GOOGLE_LABEL, value: me.googleLinked ? KEY_LINKED : KEY_MISSING },
  ];
}

export function LoginKeysSummary({ me }: { me: MeDto }) {
  return (
    <section style={sectionStyle}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {TITLE}
      </h2>
      <dl style={listStyle}>
        {loginKeyRows(me).flatMap(({ label, value }) => [
          <dt key={`${label}-t`} style={labelStyle}>
            {label}
          </dt>,
          <dd key={`${label}-d`} style={valueStyle}>
            {value}
          </dd>,
        ])}
      </dl>
    </section>
  );
}
