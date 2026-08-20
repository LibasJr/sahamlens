import { defineConfig, devices } from '@playwright/test';

/**
 * Harness pengukuran responsif.
 *
 * TIDAK menjalankan aplikasi. Utang 6 pada catatan redesign v2 berbunyi "verifikasi
 * responsif bersifat statis - telaah kelas dan breakpoint, bukan pengukuran di browser
 * sungguhan". Yang menutupnya bukan menjalankan seluruh Next.js di CI - itu menuntut
 * database, kredensial, dan penyedia data hulu, dan hasilnya adalah test yang gagal
 * karena jaringan lalu diabaikan orang dalam sebulan.
 *
 * Yang diukur di sini adalah CSS produksi yang sudah dikompilasi, di mesin layout
 * Chromium sungguhan, pada kelas yang DIAMBIL DARI SUMBER komponennya. Jadi kalau
 * sebuah kelas tata letak berubah, yang diukur ikut berubah - bukan salinan yang basi.
 *
 * Batasnya jujur: ini mengukur ATURAN CSS-nya, bukan komposisi halaman utuh. Nomor 6
 * pada daftar QA manual (tablet 768/1024 pada halaman sungguhan) tetap milik manusia.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // Tidak ada server aplikasi: setiap test menyusun halamannya sendiri lewat
    // page.setContent, jadi tidak ada baseURL dan tidak ada permintaan jaringan.
    channel: undefined,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
