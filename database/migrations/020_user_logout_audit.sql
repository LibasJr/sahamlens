-- Logout eksplisit adalah event autentikasi yang sah. Durasi sesi dihitung saat dibaca
-- dengan memasangkan logout ke login terakhir user/browser/jaringan yang sama; tidak ada
-- session sintetis atau waktu logout hasil tebakan yang disimpan.
ALTER TABLE user_auth_events
  DROP CONSTRAINT IF EXISTS user_auth_events_event_type_check;

ALTER TABLE user_auth_events
  ADD CONSTRAINT user_auth_events_event_type_check
  CHECK (event_type IN ('signup', 'login', 'verify', 'logout'));

