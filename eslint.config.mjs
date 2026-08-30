// Flat config - wajib sejak ESLint 9, yang sendirinya dituntut oleh
// eslint-config-next@16 (peerDependencies: eslint >= 9). Menggantikan
// .eslintrc.json yang isinya `{ "extends": "next/core-web-vitals" }`.
//
// eslint-config-next@16 sudah mengekspor flat config secara native, jadi tidak perlu
// FlatCompat dari @eslint/eslintrc - cukup di-spread apa adanya.
//
// Catatan untuk yang mengubah skrip `lint`: flag `--ext` TIDAK ada lagi di flat config.
// Berkas yang diperiksa ditentukan lewat `files` di dalam config ini, bukan lewat CLI.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';

export default [
  {
    // node_modules dan .git sudah diabaikan ESLint secara bawaan; sisanya artefak build
    // dan data yang tidak pernah jadi sumber lint.
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'dist/**',
      'desktop/**',
      'coverage/**',
      'public/**',
      'data/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,

  // Aturan React Compiler yang BARU menyala di eslint-config-next@16 (tidak ada di 15).
  // Saat dialihkan, keenamnya melaporkan 74 error di 57 berkas sekaligus - bukan karena
  // kode memburuk, tapi karena kelas pemeriksaan baru menyala serentak pada kode yang
  // ditulis sebelum aturannya ada.
  //
  // Diturunkan ke `warn`, BUKAN dimatikan. Isinya temuan sah - `set-state-in-effect`
  // menandai setState sinkron di dalam effect, yang memicu render berantai - jadi
  // mematikannya berarti membuang informasi. Menjadikannya error hari ini berarti
  // gerbang lint merah sampai 61 lokasi selesai dirapikan, dan gerbang yang merah
  // berkepanjangan selalu berakhir dimatikan orang.
  //
  // Hitungan saat aturan ini dipasang (2026-08-20), sebagai titik acuan penurunan:
  //   61 set-state-in-effect, 4 immutability, 3 static-components, 3 refs,
  //    2 preserve-manual-memoization, 1 purity.
  // Angkanya boleh turun, tidak boleh naik. Kalau sudah nol, naikkan kembali ke `error`
  // dan hapus blok ini.
  {
    name: 'sahamlens/react-compiler-rules-as-warnings',
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
];
