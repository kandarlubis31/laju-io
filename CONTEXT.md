# laju-io — Project Context

## Ringkasan

Transfer file antar perangkat lewat browser. Satu orang membuat ruang dan mendapat kode 4 karakter;
siapa pun yang memasukkan kode itu masuk ke ruang yang sama dan bisa saling kirim file. Tanpa akun,
tanpa aplikasi.

## Alur data

1. `POST /api/create-room` membuat kode ruang (`ABCDEFGHIJKLMNPQRSTUVWXYZ123456789`, tanpa I, O, 0
   agar tidak salah baca) dan menyimpan record ruang di Supabase.
2. Klien membuka channel Supabase untuk ruang tersebut — daftar file antar perangkat tersinkron
   tanpa polling.
3. `POST /api/generate-upload-url` membuat presigned URL S3. Klien mengunggah **langsung ke bucket**.
4. Unduh: per file, atau semua sekaligus sebagai ZIP yang dirakit di browser (JSZip).

Keputusan penting: **file tidak pernah melewati server Next.js**. Server hanya mengurus kode ruang
dan tanda tangan URL, sehingga tidak terkena batas ukuran body serverless dan tidak memakan
bandwidth fungsi.

## Struktur

```
pages/index.js                 Seluruh UI ruang: buat/gabung, daftar file, pratinjau, ZIP
pages/api/create-room.js       Pembuatan kode ruang
pages/api/generate-upload-url.js  Presigned URL unggah
pages/api/hello.js             Pemeriksaan API
lib/supabaseClient.js          Klien Supabase
```

Thumbnail dibuat di klien lewat `canvas` (sisi terpanjang 120 px) sebelum unggah, supaya pratinjau
muncul tanpa mengunduh file penuh.

## Lingkungan

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET=
```

## Menjalankan

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm run start
```

## Jebakan yang diketahui

- Tanpa autentikasi: siapa pun yang memegang kode bisa masuk ruang. Jangan dipakai untuk berkas
  sensitif.
- `pages/api/create-room.js` masih mencetak URL dan status kunci Supabase ke log server. Hapus
  sebelum produksi.
- State ruang klien disimpan di `sessionStorage`, jadi menutup tab menghilangkan sesi ruang.
