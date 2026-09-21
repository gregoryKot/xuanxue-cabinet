// Отправка push-пинга (ADR-0092, «Порядок работ» PR №4) — пустой POST на
// endpoint каждой подписки человека, с подписью VAPID (vapid-jwt.ts). Тело
// пустое по решению ADR-0092 («В push не кладётся текст»): worker сам
// перечитывает ленту кабинета, поэтому шифрование содержимого (RFC 8291,
// ключи p256dh/auth) здесь не нужно вовсе — эта служба их не читает.
//
// Транспорт — встроенный fetch (прецедент api/src/mail/mail.service.ts,
// ADR-0029), не axios (CLAUDE.md «Зависимости»).
//
// Очереди повторов НЕТ и не будет: система записи о событии — лента кабинета
// (InAppExamNotifier, ADR-0061), push — только «в карман» (ADR-0092). Сбой
// одной попытки push не должен обрасти собственным механизмом ретраев поверх
// уже существующего — учитель или ученик всё равно увидит событие в ленте
// или в Telegram. Поэтому здесь ровно один POST на подписку за вызов: успех,
// явная смерть подписки (404/410) или лог и переход к следующей — третьего
// не дано.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import { errorMessage, errorStack } from '../common/error-info';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { signVapidRequest } from './vapid-jwt';
import { readVapidConfig, type VapidConfig } from './vapid.config';

// Сколько push-сервис хранит недоставленный пинг, если устройство офлайн
// (RFC 8030 §5, заголовок TTL, в секундах) — сутки: дольше событие в ленте
// кабинета всё равно устареет раньше, чем пинг кому-то понадобится.
const PUSH_TTL_SECONDS = 86_400;
const PUSH_REQUEST_TIMEOUT_MS = 10_000;

@Injectable()
export class PushSenderService {
  private readonly logger = new Logger(PushSenderService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptions: PushSubscriptionsService,
  ) {}

  /**
   * Шлёт пинг по всем подпискам одного человека (телефон, ноутбук — не
   * прекращается из-за отказа одной, ADR-0092). Возвращает число подписок,
   * по которым была попытка отправки, — не число успешных доставок: push
   * без ответа получателя недоставим на проверку (это и есть «в карман»,
   * шапка файла), поэтому «пытались» и есть единица учёта, тем же приёмом,
   * что recipients у TelegramExamNotifier (chats.length, не число 2xx).
   * Push выключен конфигурацией (readVapidConfig → null) — 0, молча, без
   * ошибки: риск за флагом (CLAUDE.md «Рискованная фича»).
   */
  async sendToUser(userId: string, now: DateTime): Promise<number> {
    const vapid = readVapidConfig(this.config);
    if (!vapid) return 0;

    const endpoints = await this.subscriptions.listEndpointsFor(userId);
    if (endpoints.length === 0) return 0;

    await Promise.all(
      endpoints.map((endpoint) => this.sendOne(vapid, userId, endpoint, now)),
    );
    return endpoints.length;
  }

  /** Никогда не бросает — сбой одной подписки не должен прервать остальные
   * (Promise.all в sendToUser). Подпись VAPID собирается здесь же, внутри
   * try: невалидная пара ключей (например, побитая ротация) — тоже повод
   * залогировать и перейти дальше, не уронить весь вызов. */
  private async sendOne(
    vapid: VapidConfig,
    userId: string,
    endpoint: string,
    now: DateTime,
  ): Promise<void> {
    try {
      const { authorizationHeader } = signVapidRequest(vapid, endpoint, now);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authorizationHeader,
          TTL: String(PUSH_TTL_SECONDS),
          // Тело пустое (шапка файла) — Content-Encoding НЕ ставится: он
          // означал бы зашифрованное содержимое (RFC 8291), которого нет.
          'Content-Length': '0',
        },
        signal: AbortSignal.timeout(PUSH_REQUEST_TIMEOUT_MS),
      });

      if (res.status === 404 || res.status === 410) {
        // Мёртвая подписка (ADR-0092): браузер снесён или разрешение
        // отозвано. Единственный исход отправки, который меняет базу.
        await this.subscriptions.unsubscribe(userId, endpoint);
        return;
      }
      if (!res.ok) {
        // 429/5xx и подобное — не наша вина и не повод убрать подписку,
        // следующий раз может получиться. Без userId/endpoint в ключах лога
        // (SECURITY §6, redact-paths.ts) — статус-код группируется по
        // тексту сообщения, этого достаточно для «массовые отказы push»
        // (docs/RUNBOOK.md §6.5).
        this.logger.error(`push.send: push-сервис ответил ${res.status}`);
      }
    } catch (err) {
      // Сеть, таймаут, невалидный ключ — тот же довод, что и выше: залогировать
      // со стеком и идти дальше (CLAUDE.md «Логи»), без очереди повторов
      // (шапка файла).
      this.logger.error(`push.send: ${errorMessage(err)}`, errorStack(err));
    }
  }
}
