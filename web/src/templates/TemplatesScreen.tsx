// «Шаблоны» — тексты постов, которые рассылка собирает из плейсхолдеров
// (docs/PLAN.md §6 «Шаблоны»), и за сколько минут бот показывает черновик.
// Напоминание об оплате и остальные настройки школы — экран «Школа»
// (ADR-0176): здесь они были спрятаны под «Рассылками». Облик — направление «тихо и благородно»
// (docs/adr/0031, макет Form.dc.html): заголовок раздела антиквой, колонка
// страницы-редактора, разделы под волосяной линией, заливка терракотой одна —
// у «Сохранить» внизу (остальные кнопки экрана вторичные).
//
// Два редактора (анонс/запись) синхронизируются с сохранёнными по
// `updatedAt`: после успешного «Сохранить» правки в форме
// становятся «сохранённым» текстом, а не потерянным черновиком. Сохраняем
// только изменённые шаблоны (pr-k3-fixes.md п.4) — нечего сохранять, когда
// оба текста совпадают с сохранёнными, кнопка неактивна и запроса нет.
import { useState } from 'react';
import { TEMPLATE_KINDS, type TemplateKind } from '@xuanxue/shared';
import { Button } from '../components/Button';
import {
  errorFrom,
  FormServerError,
  type FormError,
} from '../components/FormServerError';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { primaryActionStyle } from '../components/screenLayout';
import { editorPageStyle, editorSectionStyle } from '../components/editorLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonLines } from '../components/Skeleton';
import { PreviewMinutesField } from './PreviewMinutesField';
import { useNextLessons } from './useNextLessons';
import { useSavedDraft } from './useSavedDraft';
import { TemplateEditor } from './TemplateEditor';
import { distributeTemplateServerError } from './templateServerError';
import { validateTemplateText } from './templateValidation';
import { useSettings } from './useSettings';

// VOICE.md «Начинать с сути, а не с определения темы» — не «Здесь тексты...»
// (pr-k3-fixes.md п.19).
const EXPLANATION = 'Что бот пишет **в канал школы**: анонс занятия и пост с записью.';

const TITLE = 'Шаблоны';
const SAVE_ERROR = 'Не удалось сохранить шаблоны. Попробуйте ещё раз.';

function changedTemplates(
  texts: Record<TemplateKind, string>,
  saved: Record<TemplateKind, string>,
): Partial<Record<TemplateKind, string>> {
  const changed: Partial<Record<TemplateKind, string>> = {};
  for (const kind of TEMPLATE_KINDS) {
    if (texts[kind] !== saved[kind]) changed[kind] = texts[kind];
  }
  return changed;
}

export default function TemplatesScreen() {
  const settingsState = useSettings();
  const lessonsState = useNextLessons();
  const settings = settingsState.settings;
  // Сверка с сохранённым по `updatedAt` — на первой загрузке и после любого
  // сохранения настроек, в том числе соседнего раздела («Черновик поста»), но
  // набранное и ещё не сохранённое она не перезатирает (useSavedDraft.ts).
  const [texts, setTexts, submit] = useSavedDraft<Record<TemplateKind, string> | null>(
    settings?.templates ?? null,
    settings?.updatedAt,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const changed = texts && settings ? changedTemplates(texts, settings.templates) : {};
  const hasChanges = Object.keys(changed).length > 0;
  const hasInvalid =
    texts !== null && TEMPLATE_KINDS.some((kind) => validateTemplateText(texts[kind]));
  const serverErrors = error ? distributeTemplateServerError(error) : null;

  async function handleSave() {
    if (pending || !hasChanges || hasInvalid) return;
    setPending(true);
    setError(null);
    try {
      await submit(texts, () => settingsState.update({ templates: changed }));
    } catch (err) {
      setError(errorFrom(err, SAVE_ERROR));
    } finally {
      setPending(false);
    }
  }

  return (
    <section style={editorPageStyle}>
      <ScreenHeader title={TITLE} explanation={EXPLANATION} />

      {settingsState.error && (
        <LoadErrorBanner
          message={settingsState.error}
          onRetry={() => void settingsState.reload()}
        />
      )}

      {settingsState.loading && !settingsState.error && (
        <SkeletonLines widths={['90%', '95%', '70%']} />
      )}

      {!settingsState.loading && !settingsState.error && texts && (
        <>
          {/* Черновик — до шаблонов постов: у него своя кнопка сохранения, а
              терракотовое «Сохранить» внизу закрывает именно шаблоны постов.
              Настройки школы (сайт, контакты, напоминания ученикам) — на
              экране «Школа» (school/SchoolScreen.tsx, ADR-0176). */}
          <PreviewMinutesField settings={settings} update={settingsState.update} />

          {TEMPLATE_KINDS.map((kind) => (
            <TemplateEditor
              key={kind}
              kind={kind}
              text={texts[kind]}
              savedText={settings?.templates[kind] ?? ''}
              onChange={(text) =>
                setTexts((prev) => (prev ? { ...prev, [kind]: text } : prev))
              }
              lessons={lessonsState.lessons ?? []}
              lessonsError={lessonsState.error}
              onRetryLessons={() => void lessonsState.reload()}
              serverError={serverErrors?.byKind[kind]}
              schoolTz={settings?.tz}
            />
          ))}

          <FormServerError error={serverErrors?.general ?? null} />

          <div style={editorSectionStyle}>
            <Button
              style={primaryActionStyle}
              onClick={() => void handleSave()}
              pending={pending}
              disabled={!hasChanges || hasInvalid}
            >
              Сохранить
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
