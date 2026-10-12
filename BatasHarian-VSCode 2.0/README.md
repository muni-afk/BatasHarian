# Batas Harian — versi lokal untuk VS Code

Versi lokal ini mempertahankan dashboard Batas Harian dan mengganti layanan khusus Hatchable dengan server Node.js lokal serta penyimpanan JSON di komputer kamu.

## Cara termudah (Windows)

1. **Ekstrak ZIP terlebih dahulu** ke folder biasa, misalnya `Documents/BatasHarian-VSCode`. Jangan menjalankan file dari dalam jendela ZIP.
2. Instal **Node.js LTS** dari https://nodejs.org/ jika belum ada. Setelah instalasi, tutup dan buka kembali VS Code.
3. Klik dua kali `JALANKAN-BATASHARIAN.bat`. Jika Windows menampilkan peringatan, pastikan file berasal dari ZIP yang kamu unduh sebelum mengizinkannya berjalan.
4. Script akan membuka server di jendela Command Prompt dan browser ke **http://127.0.0.1:3000**. Biarkan jendela server tetap terbuka selama menggunakan aplikasi.
5. Klik **Belum punya akun? Buat akun**, lalu masukkan nama, email, dan kata sandi minimal 8 karakter.

## Cara menjalankan dari VS Code

1. Ekstrak ZIP dan buka folder `BatasHarian-VSCode` melalui **File → Open Folder**.
2. Buka **Terminal → New Terminal**.
3. Jalankan `node --version`. Versi Node.js harus 18 atau lebih baru.
4. Jalankan `npm start`.
5. Buka **http://127.0.0.1:3000** di browser.
6. Untuk menghentikan server, fokus ke terminal dan tekan `Ctrl+C`.

Tidak perlu `npm install` karena proyek ini memakai modul bawaan Node.js saja.

## Fitur

- Dashboard kini dipisah menjadi tiga halaman: **Ringkasan** (`/`), **Pengeluaran** (`/pengeluaran.html`), dan **Anggaran** (`/anggaran.html`). Navigasi di sidebar digunakan untuk berpindah halaman.

- Buat akun dan masuk menggunakan email + kata sandi.
- Data tiap akun dipisahkan berdasarkan identitas pengguna.
- Anggaran bulanan dan batas harian dihitung otomatis.
- Catat dan hapus pengeluaran dengan tanggal, kategori, dan catatan.
- Perubahan anggaran dan pengeluaran otomatis tersinkron di halaman lain yang terbuka.
- Ringkasan pengeluaran hari ini, anggaran tersisa, grafik 7 hari, dan pencarian transaksi.
- Data tetap tersimpan setelah server ditutup, di `data/db.json`.

## Jika tidak bisa dijalankan

- **`node` atau `npm` tidak dikenali:** instal Node.js LTS dari https://nodejs.org/, kemudian restart VS Code/terminal.
- **Browser menampilkan error koneksi:** pastikan jendela server masih terbuka dan terminal menampilkan `Batas Harian siap dijalankan`.
- **Port 3000 sudah dipakai:** di PowerShell, jalankan `$env:PORT=3001; npm start`, lalu buka `http://127.0.0.1:3001`. Untuk file `.bat`, tutup server lama atau gunakan cara terminal ini.
- **Halaman tampil tetapi tombol tidak bekerja:** pastikan alamat dimulai dengan `http://127.0.0.1:3000`, bukan `file:///.../index.html`.
- **Lupa kata sandi lokal:** versi prototipe ini belum memiliki fitur reset kata sandi. Jangan hapus `data/db.json` kecuali memang rela kehilangan semua akun dan transaksi lokal.

## Penyimpanan dan privasi

- Seluruh data akun dan pengeluaran lokal disimpan dalam `data/db.json` yang dibuat saat server pertama kali dijalankan.
- Login lokal memakai kata sandi, bukan kode email. Email tidak dikirim keluar; email hanya menjadi nama akun. Sistem email-verification dan passkey dari Hatchable tidak dibawa karena memerlukan layanan autentikasi eksternal.
- Ini adalah versi lokal untuk belajar/prototipe, bukan server produksi. Jangan membuka port ke internet atau menggunakannya untuk menyimpan data keuangan penting tanpa peninjauan keamanan, backup, database yang lebih kuat, dan HTTPS.
## Deploy ke Render

Di Render, gunakan **Build Command** `npm install` dan **Start Command** `npm start`. Server membaca port dari `process.env.PORT` dan, saat variabel `PORT` tersedia, bind ke `0.0.0.0` agar Render dapat mendeteksi port. Jika repositori GitHub sudah terhubung, salin perubahan baris HOST pada `server.js` ke repositori, commit, lalu push agar Render membangun ulang versi terbaru.

Catatan: penyimpanan JSON dalam disk aplikasi tidak dijamin persisten pada hosting ephemeral. Untuk data yang ingin tetap tersimpan setelah restart/redeploy, gunakan persistent disk atau database terkelola.
