// Форма кода из письма (ADR-0104) — второй способ потратить ту же заявку на
// вход, что и ссылка. Используется в двух местах EmailLoginForm.tsx: сразу
// после отправки письма (адрес уже известен) и из состояния покоя (адрес
// неизвестен — приложение перезапустилось раньше, чем человек вернулся из
// почты). Один компонент на обе ситуации (CLAUDE.md «Одна механика — один
// компонент»), различие — только видимость поля адреса.
import { useState, type FormEvent } from 'react';
import { EMAIL_LOGIN_CODE_LENGTH, EMAIL_LOGIN_CODE_RE } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { EmailField } from '../components/EmailField';
import { Field, getInputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { useAuth } from './AuthProvider';
import { useEmailCodeLogin } from './useEmailCodeLogin';

const formStyle = { display: 'flex', flexDirection: 'column' as const, gap: 10 };
const codeInputStyle = getInputStyle('large');

// «123456» — не захардкожено буквами, а построено по EMAIL_LOGIN_CODE_LENGTH:
// поменяется длина кода в shared/, поменяется и подсказка сама собой.
const CODE_PLACEHOLDER = Array.from(
  { length: EMAIL_LOGIN_CODE_LENGTH },
  (_, i) => (i + 1) % 10,
).join('');

/** Из письма код приезжает вместе с лишним: пробел в хвосте после выделения
 * пальцем, автоподстановка iOS. Цифры оставляем, всё остальное молча
 * отбрасываем — иначе такой ввод упирался бы в запертую кнопку, ничего не
 * объясняя.
 *
 * Длину держит эта же чистка, а не `maxLength` у поля: браузер обрезает
 * вставленную строку по `maxLength` ДО того, как её увидит `onChange`, и от
 * « 123 456 » оставалось « 123 4» — то есть ровно вставка из письма и
 * ломалась (тест «пробелы и буквы из вставленного кода отбрасываются»). */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').slice(0, EMAIL_LOGIN_CODE_LENGTH);
}

interface EmailCodeFormProps {
  email: string;
  /** Передан — поле адреса видно и редактируется: приложение перезапустилось
   * и адрес в состоянии не сохранился. Не передан — адрес известен из только
   * что отправленного письма, спрашивать его второй раз незачем. */
  onEmailChange?: (email: string) => void;
  inviteCode?: string;
}

export function EmailCodeForm({ email, onEmailChange, inviteCode }: EmailCodeFormProps) {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const { status, error, submit } = useEmailCodeLogin(refresh, inviteCode);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    await submit(email, code);
  }

  // Адрес обязателен, только если его вообще спрашивают этой формой — когда
  // он уже известен из письма (onEmailChange не передан), пустым он быть не
  // может по построению.
  const emailMissing = Boolean(onEmailChange) && !email.trim();
  const canSubmit = EMAIL_LOGIN_CODE_RE.test(code) && !emailMissing;

  return (
    <form onSubmit={(e) => void handleSubmit(e)} style={formStyle}>
      {onEmailChange && (
        <EmailField value={email} onChange={onEmailChange} size="large" />
      )}
      <Field label="Код из письма">
        <input
          style={codeInputStyle}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={CODE_PLACEHOLDER}
          value={code}
          onChange={(e) => setCode(digitsOnly(e.target.value))}
        />
      </Field>
      <FormServerError error={error ? { message: error } : null} />
      <Button
        type="submit"
        variant="secondary"
        size="large"
        pending={status === 'pending'}
        disabled={!canSubmit}
        style={{ width: '100%' }}
      >
        Войти
      </Button>
    </form>
  );
}
