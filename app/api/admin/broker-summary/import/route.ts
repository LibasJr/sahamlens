import { guard } from '@/lib/sahamLensGuard';
guard();

import { cookies } from 'next/headers';
import { runController } from '@/shared/http/next-response.adapter';
import { parseOrThrow } from '@/shared/validation/parse-or-throw';
import { assertTrustedSameOrigin } from '@/shared/http/same-origin';
import { ForbiddenError, ValidationError } from '@/shared/errors/app-error';
import { isAdminFromRequestCookies } from '@/modules/user';
import {
  BrokerSummaryValidationError,
  importBrokerDistributionJson,
  importBrokerSummaryCsv,
} from '@/modules/broker-flow';
import { z } from 'zod';

export const maxDuration = 300;

// Body impor dulu diurai dengan rangkaian `typeof x === 'string' ? x : ''` - fail-open ke
// string kosong, sehingga field yang salah nama atau salah tipe lolos sebagai "kosong" dan
// baru gagal di dalam importer sebagai galat validasi yang tidak menyebut fieldnya. Skema
// ini menamai fieldnya dan menolak lebih awal.
//
// Dua bentuk yang sah dipisah sebagai discriminated union pada `format`, bukan satu objek
// dengan semua field opsional: csvText hanya bermakna untuk format csv, jsonText+ticker
// hanya untuk stockbit-json. Satu objek longgar tidak bisa menyatakan aturan itu.
//
// `mode` DITEMUKAN typecheck saat migrasi ini: importer menuntut 'dry-run' | 'insert',
// tapi route lama meneruskan body.mode yang bertipe any - jadi `mode: 'hapus-semua'`
// masuk tanpa perlengan sampai ke importer. Default 'dry-run' dipilih sengaja: impor
// admin yang tidak menyebut modenya harus MENSIMULASI, bukan menulis ke tabel produksi.
const importBodySchema = z.discriminatedUnion('format', [
  z.object({
    format: z.literal('csv'),
    csvText: z.string().min(1, 'csvText wajib diisi'),
    mode: z.enum(['dry-run', 'insert']).default('dry-run'),
    source: z.string().optional(),
    sourceFile: z.string().optional(),
  }),
  z.object({
    format: z.literal('stockbit-json'),
    jsonText: z.string().min(1, 'jsonText wajib diisi'),
    ticker: z.string().min(1, 'ticker wajib diisi'),
    mode: z.enum(['dry-run', 'insert']).default('dry-run'),
    source: z.string().optional(),
    sourceFile: z.string().optional(),
  }),
]);

export async function POST(request: Request) {
  return runController(async () => {
    assertTrustedSameOrigin(request);
    if (!(await isAdminFromRequestCookies(await cookies()))) {
      throw new ForbiddenError('Admin access required');
    }

    // `format` default 'csv' dipertahankan: pemanggil lama yang tidak mengirimnya sama
    // sekali tetap diperlakukan sebagai CSV, sama seperti sebelumnya.
    const raw = (await request.json()) as Record<string, unknown>;
    const body = parseOrThrow(importBodySchema, { ...raw, format: raw.format ?? 'csv' });

    try {
      const result = body.format === 'stockbit-json'
        ? await importBrokerDistributionJson({
            jsonText: body.jsonText,
            ticker: body.ticker,
            mode: body.mode,
            source: body.source,
            sourceFile: body.sourceFile,
          })
        : await importBrokerSummaryCsv({
            csvText: body.csvText,
            mode: body.mode,
            source: body.source,
            sourceFile: body.sourceFile,
          });
      return { status: 200, body: result };
    } catch (error) {
      // BrokerSummaryValidationError membawa pesan yang MEMANG ditujukan ke admin yang
      // menempelkan datanya (baris berapa, kolom apa yang salah), jadi ia diterjemahkan
      // ke ValidationError yang mengekspos pesannya - bukan dibiarkan jatuh ke 500 yang
      // menyamarkannya. Error lain tetap disamarkan runController.
      if (error instanceof BrokerSummaryValidationError) {
        throw new ValidationError(error.message);
      }
      throw error;
    }
  });
}
