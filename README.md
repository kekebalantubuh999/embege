# MBG° — Portal Menu Harian SPPG

Portal katalog menu harian **Makan Bergizi Gratis (MBG)** terpusat untuk 1 unit **Satuan Pelayanan Pangan Bergizi (SPPG)** yang melayani kluster sekolah binaan, dengan tampilan interaktif *rotating ring* (*single-screen web app*) dan dukungan integrasi **Google Sheets + Google Apps Script**.

## Fitur Utama

- **Ring Ompreng Interaktif 5 Hari (`Senin`–`Jumat`)**: Berputar otomatis secara kontinu, dapat digeser (*drag/fling*), serta navigasi langsung per hari (`SEN`–`JUM`).
- **Auto-Date & Detail Menu 6 Komponen**: Otomatis menyorot menu hari berjalan dan menampilkan 6 komponen isi ompreng (*Makanan Pokok, Lauk Utama, Lauk Pendamping, Sayuran, Buah, Pelengkap*).
- **Selektor Porsi Jenjang**: Penyesuaian panduan takaran/gramasi untuk jenjang **PAUD/TK**, **SD**, dan **SMP/SMA**.
- **Salin Ringkasan WhatsApp**: Tombol `SALIN MENU WA →` untuk menyalin format pesan siap kirim ke grup WhatsApp guru/wali murid, lengkap dengan pratinjau dan tautan `BUKA WHATSAPP`.
- **Penanganan Kondisi Khusus (`EC-01`–`EC-04`)**: Pesan informatif untuk libur akhir pekan (`?simState=weekend`), menu dalam persiapan (`?simState=empty`), dan galat koneksi dengan tombol coba lagi (`?simState=error`).

## Struktur Repositori

- `index.html` — Aplikasi web statis mandiri (HTML + CSS + Vanilla JS tanpa framework/build step).
- `assets/ompreng-sheet.webp` — *Sprite sheet* transparan 5 sekat ompreng SUS304 untuk menu Senin–Jumat.
- `assets/raw/` — Gambar sumber ompreng per hari.
- `scripts/build_sprite.py` — Skrip Python pembuat *sprite sheet* WebP transparan dan pengemas `gas/Index.html`.
- `gas/` — Paket siap deploy untuk **Google Apps Script (V8 Runtime)**:
  - `gas/Setup.gs` — Inisialisasi otomatis tab `Menu_MBG` & `Pengaturan_SPPG` di Google Sheets + menu **"🍱 Admin MBG SPPG"**.
  - `gas/Code.gs` — Endpoint `doGet(e)`, `getMenuData()`, `clearMenuCache()`, dan validasi data aman `Date`.
  - `gas/Index.html` — Antarmuka lengkap dengan gambar WebP tertanam (*inline base64*) dan koneksi `google.script.run.getMenuData()`.
  - `gas/appsscript.json` — Manifest konfigurasi V8 (`Asia/Jakarta`, `ANYONE_ANONYMOUS`).
- `docs/PRD-Portal-Menu-MBG.md` — Dokumen Product Requirements Document (PRD).

## Menjalankan Secara Lokal / GitHub Pages

1. Jalankan server statis apa saja pada direktori root proyek, misalnya:
   ```bash
   python -m http.server 8765
   ```
2. Buka `http://localhost:8765/index.html` di browser (atau aktifkan **GitHub Pages** langsung pada branch `main` folder `/ (root)`).
3. Untuk membaca data langsung dari Google Sheets yang dipublikasikan sebagai CSV, tambahkan parameter `?csv=<URL_CSV_GOOGLE_SHEETS>`.

## Cara Deploy ke Google Apps Script (4 Langkah)

1. Buka Google Sheets baru untuk unit SPPG, lalu buka **Extensions (Ekstensi) → Apps Script**.
2. Salin isi `gas/Setup.gs` dan `gas/Code.gs`, buat file HTML bernama `Index` lalu salin isi `gas/Index.html`, serta aktifkan tampilan manifest di *Project Settings* untuk menyalin `gas/appsscript.json`.
3. Jalankan fungsi `setupDatabase` sekali dari editor Apps Script (atau muat ulang Spreadsheet lalu klik menu **"🍱 Admin MBG SPPG → 🚀 Inisialisasi Database (Setup)"**) untuk membuat tab `Menu_MBG` dan `Pengaturan_SPPG`.
4. Klik **Deploy → New deployment → Web app**, pilih *Execute as: Me* dan *Who has access: Anyone*, lalu bagikan tautan Web App ke sekolah binaan.
