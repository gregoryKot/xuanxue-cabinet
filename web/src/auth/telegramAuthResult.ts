// Вход через Telegram уводит вкладку на oauth.telegram.org на любом
// устройстве (redirectToTelegramAuth, ADR-0028) — Telegram подтверждает вход
// и редиректит её обратно на return_to с результатом во фрагменте адреса, а
// не через postMessage (тот путь принадлежал попапу, которого в кабинете
// больше нет — исходная вкладка с кнопкой его сообщения всё равно не
// дожидалась, баг с прода, найден владельцем 2026-09-08). Разбор фрагмента —
// тот же алгоритм, что был у `haveTgAuthResult()` внутри telegram-widget.js:
// regex по `location.hash`, base64url → base64 с паддингом, декодирование в
// JSON — с одной поправкой на кириллицу, см. decodeBase64UrlJson ниже.
// Подлинность мы не проверяем — её проверяет сервер той же подписью `hash`
// (SECURITY.md §2): битый или подделанный фрагмент не даёт новых прав,
// только не должен ронять экран входа — поэтому любое отклонение от формы
// возвращает `null`, а не бросает исключение.
import type { TelegramLoginInput } from '@xuanxue/shared';

const TG_AUTH_RESULT_RE = /[#?&]tgAuthResult=([A-Za-z0-9\-_=]*)$/;

export function readTelegramAuthResult(hash: string): TelegramLoginInput | null {
  const match = TG_AUTH_RESULT_RE.exec(hash);
  const encoded = match?.[1];
  if (!encoded) return null;

  const parsed = decodeBase64UrlJson(encoded);
  return isTelegramLoginInput(parsed) ? parsed : null;
}

function decodeBase64UrlJson(value: string): unknown {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = (4 - (base64.length % 4)) % 4;
  try {
    // Голый atob() (как в виджете) отдаёт бинарную строку байт-в-символ:
    // кириллическое first_name в сырых UTF-8-байтах превращается в
    // мохибейк, а сервер считает HMAC по значениям полей — испорченное имя
    // не совпадёт с hash, и вход снова сломан для кириллических имён (ревью
    // по этому багу). Декодируем байты как UTF-8 через TextDecoder — тогда
    // работает и сырой UTF-8, и \uXXXX-экранированный JSON.
    const bytes = Uint8Array.from(atob(base64 + '='.repeat(paddingLength)), (c) =>
      c.charCodeAt(0),
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null; // битый base64 или не-JSON внутри — не наша ошибка, не роняем экран
  }
}

function isTelegramLoginInput(value: unknown): value is TelegramLoginInput {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.auth_date === 'number' &&
    typeof candidate.hash === 'string' &&
    candidate.hash.length > 0 &&
    typeof candidate.first_name === 'string'
  );
}
