// Четыре переменные Cloudflare R2 в одном месте (ADR-0057). Хранилище
// необязательно: нет ключей — `readR2Config` отдаёт `null`, загрузка файлов
// выключена, кабинет поднимается как прежде. Иначе локальная разработка, CI и
// Docker-смок встали бы из-за внешнего сервиса, который им не нужен.
//
// Валидатор env (config/env.validation.ts) уже не даёт подняться с половиной
// набора — проверка «все четыре» здесь вторая линия обороны, не первая
// (тот же приём, что у MailService с RESEND_API_KEY/MAIL_FROM).
import type { ConfigService } from '@nestjs/config';
import { encodeRfc3986, type SigV4Credentials } from './sigv4-canonical';

// R2 не различает регионы: её S3-совместимый эндпоинт принимает только это
// значение в области действия подписи.
const R2_REGION = 'auto';
const R2_SERVICE = 's3';

export interface R2Config {
  credentials: SigV4Credentials;
  /** `https://<account>.r2.cloudflarestorage.com` — собирается из
   * `R2_ACCOUNT_ID`, отдельной переменной с адресом нет: лишний способ
   * настроить одно и то же разъезжается с ключами при ротации. */
  endpoint: string;
  bucket: string;
}

export function readR2Config(config: ConfigService): R2Config | null {
  const accountId = config.get<string>('R2_ACCOUNT_ID');
  const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID');
  const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY');
  const bucket = config.get<string>('R2_BUCKET');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    credentials: { accessKeyId, secretAccessKey, region: R2_REGION, service: R2_SERVICE },
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
  };
}

/** Адрес объекта в бакете. Каждый сегмент кодируется по RFC 3986 — подпись
 * считается по этому же пути (sigv4-canonical.ts, `SignInput.url`), поэтому
 * кодирование должно случиться здесь и ровно один раз. */
export function objectUrl({ endpoint, bucket }: R2Config, key: string): string {
  const path = key
    .split('/')
    .map((segment) => encodeRfc3986(segment))
    .join('/');
  return `${endpoint}/${encodeRfc3986(bucket)}/${path}`;
}
