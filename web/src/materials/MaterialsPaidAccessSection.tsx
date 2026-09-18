// Рубильник школы «после оплаты» (docs/PLAN.md §14 слой 3.4, ADR-0048) —
// рядом со списком материалов, которым он управляет (CLAUDE.md «Кабинет
// учителя: всё настраивается в интерфейсе»). Настройки — общий useSettings
// (templates/useSettings.ts, тот же приём, что TemplatesScreen.tsx): второй
// хук настроек по CLAUDE.md «Одна механика — один компонент» не заводим.
import { useState, type CSSProperties } from 'react';
import {
  errorFrom,
  FormServerError,
  type FormError,
} from '../components/FormServerError';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { Toggle } from '../components/Toggle';
import { useSettings } from '../templates/useSettings';
import { formatPaidMaterialsCountHint } from './materialsPaidCountHint';

const LABEL = 'Открывать материалы «после оплаты» только оплатившим';
// VOICE.md + ADR-0048: честно про сегодня. Оплаты кабинет пока не ведёт,
// отличить оплативших не по чему — значит включённая настройка закроет такие
// материалы у всех учеников сразу. Слово «рубильник» живёт в коде и ADR, на
// экране его нет: учитель видит переключатель, а не нашу метафору.
const EXPLANATION =
  'Оплаты кабинет пока не ведёт — отличить оплативших не по чему. ' +
  'Включите, и такие материалы закроются у всех учеников.';
const SAVE_ERROR_MESSAGE = 'Не удалось сохранить настройку. Попробуйте ещё раз.';

const sectionStyle: CSSProperties = {
  paddingTop: 16,
  paddingBottom: 16,
  borderTop: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
};

interface MaterialsPaidAccessSectionProps {
  /** Сколько материалов из уже загруженного списка помечены «после оплаты» —
   * `null`, когда список ещё не пришёл или отфильтрован по виду: тогда число
   * не отражало бы всю библиотеку, честнее не показывать его вовсе. */
  paidCount: number | null;
}

export function MaterialsPaidAccessSection({
  paidCount,
}: MaterialsPaidAccessSectionProps) {
  const { settings, loading, error, reload, update } = useSettings();
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState<FormError | null>(null);

  // Повторный клик, пока предыдущий запрос ещё в пути, блокирует
  // `disabled={pending}` у Toggle (тот же приём, что NotificationPrefsSection.tsx) —
  // второй защиты внутри обработчика не нужно.
  async function handleChange(checked: boolean) {
    setPending(true);
    setSaveError(null);
    try {
      await update({ materialsPaidAccess: checked });
    } catch (err) {
      setSaveError(errorFrom(err, SAVE_ERROR_MESSAGE));
    } finally {
      setPending(false);
    }
  }

  if (error) return <LoadErrorBanner message={error} onRetry={() => void reload()} />;
  if (loading || !settings) return null;

  const countHint = formatPaidMaterialsCountHint(paidCount);
  const hint = countHint ? `${EXPLANATION} ${countHint}` : EXPLANATION;

  return (
    <div style={sectionStyle}>
      <Toggle
        label={LABEL}
        hint={hint}
        checked={settings.materialsPaidAccess}
        disabled={pending}
        onChange={(checked) => void handleChange(checked)}
      />
      <FormServerError error={saveError} />
    </div>
  );
}
