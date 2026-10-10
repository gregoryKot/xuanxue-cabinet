// Куда вернуться после входа (аудит docs/audits/2026-09-12-quality-audit.md,
// находка L2): раньше RequireAuth отправлял гостя на /login без памяти об
// экране, а три точки после входа жёстко вели на /schedule — человек с
// глубокой ссылкой (`/exams`, `/planning?week=2`) после входа попадал не
// туда, откуда пришёл. Здесь — одна механика на всё: RequireAuth сохраняет
// адрес перед уходом на /login, все точки после входа читают его отсюда же
// (CLAUDE.md «Одна механика — один компонент»).
//
// sessionStorage, не localStorage: путь должен пережить переход текущей
// вкладки на oauth.telegram.org и обратно (ADR-0028) и переход по ссылке из
// письма в той же вкладке — ровно то, для чего sessionStorage и существует.
// Это НЕ токен из SECURITY §2 («токены в localStorage запрещены») — там речь
// о секрете сессии; путь экрана и так виден в адресной строке, хранить его
// в браузере нечего скрывать.
import { nativeLoginPath, peekNativeAttempt } from './nativeAttempt';

const RETURN_TO_KEY = 'xuanxue:returnTo';

/** Домашний экран — единая точка вместо разъехавшихся /schedule и /planning
 * (аудит L2): «/» сам решает, куда вести (App.tsx), так экран после входа
 * совпадает с тем, что видно по нажатию логотипа. */
const HOME_PATH = '/';
const LOGIN_PATH = '/login';

/** Только внутренний путь: один ведущий слэш и не два (`//evil.com` —
 * протокол-независимый редирект на чужой хост, браузер трактует его как
 * `https://evil.com`), не обратный слэш после слэша (`/\evil.com` — браузеры
 * приравнивают `\` к `/` в начале URL, тот же обход), не сам /login (иначе
 * после входа человек снова окажется на экране входа). */
function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.startsWith('/\\')) return false;
  if (path.startsWith('/login')) return false;
  return true;
}

/** Запомнить экран для возврата после входа. Тихо игнорирует небезопасный
 * или пустой путь и недоступное хранилище (приватный режим, отключённые
 * куки) — в этих случаях ведём себя так, будто сохранять нечего. */
export function saveReturnTo(path: string): void {
  if (!isSafeReturnPath(path)) return;
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // недоступное хранилище — не роняем вход из-за невозможности запомнить путь
  }
}

/** Забрать сохранённый путь и удалить его — одноразово, чтобы старый адрес
 * не всплыл при следующем входе. `null`, если адреса нет, хранилище
 * недоступно или сохранённое значение больше не проходит проверку. */
export function consumeReturnTo(): string | null {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY);
    if (path === null) return null;
    sessionStorage.removeItem(RETURN_TO_KEY);
    return isSafeReturnPath(path) ? path : null;
  } catch {
    return null;
  }
}

/** Куда вести после успешного входа — экран входа Daychi, сохранённый экран
 * или домашний. Единая функция для всех точек завершения входа (LoginScreen,
 * useTelegramAuthResultLogin, useEmailLoginVerify, EmailLoginCallbackScreen).
 * Попытка Daychi в этой вкладке (nativeAttempt.ts) — своей веткой и первой:
 * человек начал вход из приложения, и вернуть его надо туда; returnTo при
 * этом не снимается — он пригодится следующему обычному входу. */
export function postLoginPath(): string {
  return nativeAttemptPath() ?? consumeReturnTo() ?? HOME_PATH;
}

/** Куда вести гостя с тупика входа (битая ссылка, сбой callback-входа):
 * при попытке Daychi в этой вкладке — на её экран, где можно и войти
 * снова, и вернуться в приложение; иначе — на обычный экран входа. */
export function loginPath(): string {
  return nativeAttemptPath() ?? LOGIN_PATH;
}

function nativeAttemptPath(): string | null {
  const nativeAttempt = peekNativeAttempt();
  return nativeAttempt === null ? null : nativeLoginPath(nativeAttempt);
}
