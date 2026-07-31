import * as Sentry from '@sentry/nextjs';

// Logger terstruktur minimal, tanpa dependency tambahan. Menggantikan pola
// `console.log`/`console.error` polos yang tersebar di 73+ tempat (temuan L5) dengan
// output JSON satu baris per event: level, waktu, pesan, context, dan (kalau ada)
// requestId untuk menelusuri satu request lewat banyak log.
//
// error() sekarang JUGA lapor ke Sentry (Production Checklist poin 5) - satu titik
// panggil yang konsisten, persis seperti yang dicatat di komentar ini sejak awal:
// "migrasi ke Pino/Sentry nanti tinggal ganti isi file ini, bukan 73 call site."

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  module?: string;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'token', 'secret', 'hash', 'code', 'verification_code', 'reset_code']);

function redact(context: LogContext): LogContext {
  const out: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
}

function write(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...redact(context),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext & { err?: unknown }) => {
    const { err, ...rest } = context || {};
    const errInfo = err instanceof Error ? { errName: err.name, errMessage: err.message, errStack: err.stack } : err ? { err } : {};
    write('error', message, { ...rest, ...errInfo });

    try {
      Sentry.withScope((scope) => {
        scope.setContext('log', rest as Record<string, unknown>);
        if (err instanceof Error) {
          Sentry.captureException(err, { extra: { message } });
        } else {
          Sentry.captureMessage(message, 'error');
        }
      });
    } catch {
      // Sentry tidak boleh pernah menggagalkan request nyata - diamkan kalau SDK
      // belum siap/DSN kosong (Sentry.init menangani itu, ini jaring pengaman ekstra).
    }
  },
};
