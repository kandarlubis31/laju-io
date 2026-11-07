# Laju.io

Pindahkan file antar perangkat lewat browser, tanpa aplikasi dan tanpa akun.

Satu orang membuat ruang, mendapat kode 4 karakter, lalu membagikannya. Siapa pun yang memasukkan
kode itu langsung masuk ke ruang yang sama dan bisa mengunggah maupun mengunduh file di dalamnya.
Tidak ada langkah daftar, tidak ada tautan yang kedaluwarsa diam-diam.

## Cara kerja

1. **Buat ruang** — server membuat kode 4 karakter (tanpa huruf yang mudah tertukar) dan menyimpan
   sesi ruang di Supabase.
2. **Bagikan kode** — kode ditampilkan sebagai teks dan QR, jadi bisa dibaca perangkat lain tanpa
   mengetik.
3. **Unggah** — klien meminta *presigned URL* ke `/api/generate-upload-url`, lalu mengirim file
   langsung ke object storage. File tidak pernah melewati server Next.js.
4. **Unduh** — daftar file di ruang diperbarui lewat channel Supabase, file bisa diunduh satu per
   satu atau sekaligus sebagai ZIP (dibuat di browser dengan JSZip).

Thumbnail dibuat di sisi klien lewat `canvas` (maksimal 120 px) sebelum unggah, supaya pratinjau
gambar muncul cepat tanpa memuat file penuh.

## Halaman & API

| Rute | Fungsi |
| :--- | :--- |
| `/` | Antarmuka ruang: buat ruang, gabung ruang, daftar file, pratinjau |
| `POST /api/create-room` | Membuat kode ruang baru untuk `hostId` |
| `POST /api/generate-upload-url` | Membuat presigned URL unggah ke S3 |
| `/api/hello` | Pemeriksaan sederhana bahwa API hidup |

## Lingkungan

```bash
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
npm run build
npm run start
```

## Stack

Next.js 14 (Pages Router) · React 18 · Tailwind CSS 3 · Supabase (realtime + data ruang) ·
AWS SDK v3 (`@aws-sdk/s3-request-presigner`) · JSZip · `qrcode.react` · `react-hot-toast`

## Status

Ruang bersifat sementara dan tanpa autentikasi: siapa pun yang memegang kode bisa masuk. Jangan
pakai untuk berkas sensitif.

---

## English

**Laju.io** moves files between devices through the browser, with no app and no account. One person creates a room, gets a four-character code, and shares it; anyone who enters the code can send or receive files.

---

## Lisensi

Repository ini belum memuat berkas lisensi. Anggap semua hak dipegang penulis.
