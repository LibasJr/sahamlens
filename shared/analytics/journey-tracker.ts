import {
  MAX_JOURNEY_BATCH,
  type JourneyBatch,
  type JourneyEventInput,
  type JourneyEventName,
  type JourneySurface,
} from './journey-events';

/**
 * Antrean event perjalanan riset, tanpa satu pun API browser.
 *
 * Semua yang menyentuh window/localStorage/fetch masuk lewat `ports`, supaya aturan yang
 * benar-benar gampang salah - kapan session_start disisipkan, apa yang terjadi saat
 * pengiriman gagal, apakah flush ganda mengirim dua kali - bisa diuji sungguhan. Repo ini
 * tidak punya jsdom, jadi apa pun yang hanya hidup di dalam handler DOM praktis tidak
 * tergerbang.
 */

export interface JourneyIdentity {
  visitorId: string;
  sessionId: string;
  /** True hanya untuk pemanggil pertama sebuah sesi - yang menyisipkan session_start. */
  isNewSession: boolean;
}

export interface JourneyTrackerPorts {
  /** Null kalau identitas tidak bisa dibentuk (SSR, storage diblokir, tanpa randomUUID). */
  identity(): JourneyIdentity | null;
  /** Jarak dari awal sesi dalam milidetik. */
  elapsedMs(): number;
  send(batch: JourneyBatch): Promise<void>;
}

export interface JourneyTracker {
  track(name: JourneyEventName, surface: JourneySurface): void;
  flush(): Promise<void>;
  /** Menunggu pengiriman otomatis (antrean penuh) selesai - dipakai test. */
  settled(): Promise<void>;
}

export function createJourneyTracker(ports: JourneyTrackerPorts): JourneyTracker {
  let queue: JourneyEventInput[] = [];
  let identity: JourneyIdentity | null = null;
  let inFlight: Promise<void> = Promise.resolve();

  function ensureIdentity(): JourneyIdentity | null {
    if (!identity) identity = ports.identity();
    return identity;
  }

  function track(name: JourneyEventName, surface: JourneySurface): void {
    const who = ensureIdentity();
    if (!who) return;

    if (who.isNewSession && queue.length === 0) {
      // t0 harus ADA di data, bukan disimpulkan dari event paling awal yang kebetulan
      // terekam - kalau sesi dimulai di halaman yang tidak melacak apa pun, "waktu sampai
      // tindakan berguna pertama" akan terbaca jauh lebih cepat daripada kenyataannya.
      queue.push({ name: 'session_start', surface, elapsedMs: 0 });
      who.isNewSession = false;
    }

    queue.push({ name, surface, elapsedMs: Math.max(0, Math.round(ports.elapsedMs())) });
    if (queue.length >= MAX_JOURNEY_BATCH) {
      // Melampaui batas berarti seluruh kiriman ditolak validator server, jadi antrean
      // dikirim tepat saat penuh - bukan setelahnya.
      inFlight = inFlight.then(() => flush());
    }
  }

  async function flush(): Promise<void> {
    const who = ensureIdentity();
    if (!who || queue.length === 0) return;

    // Antrean dikosongkan SEBELUM pengiriman, dan kegagalan tidak mengembalikannya:
    // browser yang sedang offline kalau tidak akan menumpuk event tanpa batas sampai
    // tabnya ditutup, lalu mengirim kelompok raksasa yang justru ditolak karena panjang.
    const events = queue;
    queue = [];

    try {
      await ports.send({ visitorId: who.visitorId, sessionId: who.sessionId, events });
    } catch {
      // Analitik tidak pernah menjadi alasan sebuah halaman gagal.
    }
  }

  return {
    track,
    flush,
    settled: () => inFlight,
  };
}
