/**
 * Zero Dummy Policy: source yang boleh dibaca oleh jalur Broker Summary publik.
 *
 * `IDX_EOD_REPORT` sengaja TIDAK ada di daftar ini karena label tersebut pernah
 * dipakai oleh generator sintetis lama dan juga parser report manual. Sampai baris
 * historis direkonsiliasi/karantina di database, provenance source itu tidak dapat
 * dipercaya untuk jalur publik.
 */
export const PUBLIC_BROKER_DAILY_SOURCE = 'INDEX_ALPHA_API' as const;

export const PUBLIC_BROKER_DAILY_SOURCES = [PUBLIC_BROKER_DAILY_SOURCE] as const;

export type BrokerDailyIntegrityStatus = 'KNOWN_EXTERNAL_PROVIDER_UNRECONCILED';

export function brokerDailyIntegrityStatus(source: string): BrokerDailyIntegrityStatus | null {
  return source === PUBLIC_BROKER_DAILY_SOURCE ? 'KNOWN_EXTERNAL_PROVIDER_UNRECONCILED' : null;
}
