// «Шаблоны» — тексты постов, которые рассылка собирает из плейсхолдеров
// (docs/PLAN.md §6 «Шаблоны»). Облик — направление «тихо и благородно»
// (docs/adr/0031, макет Form.dc.html): заголовок раздела антиквой, колонка
// страницы-редактора, разделы под волосяной линией, киноварь одна — у
// «Сохранить» внизу (остальные кнопки экрана вторичные).
//
// Два редактора (анонс/запись) синхронизируются с сохранёнными по
// `updatedAt`: после успешного «Сохранить» правки в форме
// становятся «сохранённым» текстом, а не потерянным черновиком. Сохраняем
// только изменённые шаблоны (pr-k3-fixes.md п.4) — нечего сохранять, когда
// оба текста совпадают с сохранёнными, кнопка неактивна и запроса нет.
import { useEffect, useState } from 'react';
import { TEMPLATE_KINDS, type TemplateKind } from '@xuanxue/shared';
import { Button } from '../components/Button';
import {
  errorFrom,
  FormServerError,
  type FormError,
} from '../components/FormServerError';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import {
  editorPageStyle,
  editorSectionStyle,
  primaryActionStyle,
} from '../components/screenLayout';
import { ScreenHeader } from '../components/ScreenHeader';
import { SkeletonLines } from '../components/Skeleton';
import { SchoolSiteField } from './SchoolSiteField';
import { useNextLessons } from './useNextLessons';
import { TemplateEditor } from './TemplateEditor';
import { distributeTemplateServerError } from './templateServerError';
import { validateTemplateText } from './templateValidation';
import { useSettings } from './useSettings';

// VOICE.md «Начинать с сути, а не с определения темы» — не «Здесь тексты...»
// (pr-k3-fixes.md п.19).
const EXPLANATION =
  'Рассылка собирает пост из двух шаблонов ниже — анонса занятия и записи. ' +
  'В фигурных скобках — подстановки, пустая исчезает вместе со своим разделителем.';

const TITLE = 'Шаблоны постов';
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
  const [texts, setTexts] = useState<Record<TemplateKind, string> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  const settings = settingsState.settings;

  // Синхронизация с сохранённым — по `updatedAt`: сработает и на первой
  // загрузке, и заново после успешного «Сохранить» (reload внутри update),
  // но не перезатирает то, что учитель ещё печатает между сохранениями.
  useEffect(() => {
    if (settings) setTexts(settings.templates);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- нужен именно updatedAt, не весь объект settings
  }, [settings?.updatedAt]);

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
      await settingsState.update({ templates: changed });
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
          <SchoolSiteField settings={settings} update={settingsState.update} />

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
