// Экран «Школа» (ADR-0176) — что ученики и новички знают о школе и что им
// приходит от неё: кому платить и когда напомнить об оплате, кому писать
// новичку, за сколько минут напомнить о занятии, сайт, кто отвечает за данные.
// Вход — карточка «Школа» в рубрике «Настроить» на доске штата (ADR-0174).
// Раньше эти шесть настроек лежали на «Шаблонах» под «Рассылками» — три
// нажатия и длинная прокрутка, и найти их было нельзя (владелец 2026-10-07:
// «как это найти?»). Порядок разделов — по тому, как часто их трогают:
// оплата, потом новички и напоминания, потом то, что настраивают один раз.
// Каждый раздел сохраняется своей кнопкой; данные — один GET /settings,
// ответ PATCH сразу встаёт на экран (useSettings.ts, ADR-0087).
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { editorPageStyle } from '../components/editorLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonLines } from '../components/Skeleton';
import { useSettings } from '../templates/useSettings';
import { DataControllerField } from './DataControllerField';
import { LessonReminderField } from './LessonReminderField';
import { NewcomerContactField } from './NewcomerContactField';
import { PaymentContactField } from './PaymentContactField';
import { PaymentReminderSection } from './PaymentReminderSection';
import { SchoolSiteField } from './SchoolSiteField';

const TITLE = 'Школа';
const EXPLANATION =
  'Что ученики знают о школе: **кому платить**, кому писать новичку, когда напомнить о занятии.';

export default function SchoolScreen() {
  const { settings, loading, error, reload, update } = useSettings();

  return (
    <section style={editorPageStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
      {loading && !error && <SkeletonLines widths={['90%', '95%', '70%']} />}

      {!loading && !error && settings && (
        <>
          <PaymentContactField settings={settings} update={update} />
          <PaymentReminderSection settings={settings} update={update} />
          <NewcomerContactField settings={settings} update={update} />
          <LessonReminderField settings={settings} update={update} />
          <SchoolSiteField settings={settings} update={update} />
          <DataControllerField settings={settings} update={update} />
        </>
      )}
    </section>
  );
}
