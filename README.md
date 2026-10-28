# Hanifah Store — Landing Page COD

Landing page marketplace sederhana untuk **hanifah.store**. Pembeli memilih produk, mengisi alamat, lalu pesanan terkirim otomatis ke WhatsApp admin. Pembayaran **COD** via **JNE**, ongkir dikonfirmasi admin.

Tanpa database, tanpa biaya server tambahan (cukup hosting Niagahoster yang sudah ada).

## Struktur

```
index.html            Halaman utama
assets/css/style.css  Tampilan
assets/js/config.js   ⚙️ PENGATURAN TOKO (edit di sini)
assets/js/app.js      Logika keranjang & kirim WA
assets/img/logo.svg   Logo (ganti dengan logo Anda)
data/products.csv     Daftar produk
.htaccess             Paksa HTTPS
.cpanel.yml           Deploy otomatis dari GitHub ke cPanel
```

## 1. Atur toko — `assets/js/config.js`

| Isian | Keterangan |
|---|---|
| `waNumber` | Nomor WA admin, format `628xxxxxxxxxx` |
| `productsCsvUrl` | `data/products.csv` atau link CSV Google Sheet |
| `metaPixelId` | ID Meta Pixel (kosongkan jika belum ada) |
| `brandColor` | Warna utama, contoh `#0f766e` |

## 2. Kelola produk

Kolom wajib di `data/products.csv`:

| kode | nama | harga | harga_coret | kategori | deskripsi | foto | aktif | unggulan |
|---|---|---|---|---|---|---|---|---|
| Kode barang Accurate | Nama produk | Harga jual, angka saja | Harga sebelum diskon (kosongkan bila tidak diskon) | Untuk filter | Singkat | Nama file di `assets/img/produk/` atau link gambar | `ya` / `tidak` | `ya` = tampil di carousel "Terlaris" |

Jika `harga_coret` lebih besar dari `harga`, kartu produk menampilkan harga coret dan label persen diskon otomatis.

**Cara paling mudah (tanpa edit kode):** pakai Google Sheet.
1. Buat Google Sheet dengan kolom di atas (baris pertama = judul kolom).
2. **File → Bagikan → Publikasikan ke web** → pilih sheet → format **CSV** → Publikasikan.
3. Salin link, tempel di `productsCsvUrl`.
4. Selanjutnya cukup edit Sheet; situs ikut berubah (jeda ±5 menit dari Google).

Foto: unggah ke folder `assets/img/produk/` lalu isi kolom foto dengan `assets/img/produk/nama-file.jpg`, atau pakai link gambar publik.

## 3. Unggah ke GitHub

1. Buat repo baru di github.com (misal `hanifah-store`).
2. **Add file → Upload files**, seret semua isi folder ini, lalu **Commit**.
3. Pastikan `.htaccess` dan `.cpanel.yml` ikut terunggah (file berawalan titik kadang tersembunyi; aktifkan "tampilkan file tersembunyi" di komputer).

## 4. Pasang ke Niagahoster

**Cara A — Git (otomatis):**
1. Edit `.cpanel.yml`, ganti `USERNAME` dengan username cPanel.
2. cPanel → **Git™ Version Control** → **Create** → tempel link clone repo GitHub.
   Repo *private* perlu SSH key: cPanel → SSH Access → buat key → tambahkan di GitHub (Settings → Deploy keys).
3. Buka repo di cPanel → tab **Pull or Deploy** → **Update from Remote** → **Deploy HEAD Commit**.

**Cara B — Manual:** cPanel → File Manager → `public_html` → unggah semua file.

Pastikan SSL aktif (hPanel/cPanel → SSL) agar `https://hanifah.store` berjalan.

> Catatan: buka situs lewat hosting, bukan dengan klik ganda `index.html`, karena produk dimuat dari file CSV.

## Alur pesanan

1. Pembeli pilih produk → keranjang → isi data pengiriman.
2. Tombol **Kirim Pesanan ke WhatsApp** membuka chat ke admin berisi rincian lengkap (termasuk kode barang Accurate).
3. Admin membalas total (barang + ongkir JNE).
4. Pembeli membalas **SETUJU** → paket dikirim → dibayar saat tiba.

## Promo

Diatur di bagian `promos` dalam `assets/js/config.js`:

| Promo | Isian | Keterangan |
|---|---|---|
| Gratis ongkir | `freeShipping.minPurchase` | Minimal belanja (sebelum diskon) |
| | `freeShipping.areas` | Kata kunci kota yang dapat gratis ongkir |
| Diskon | `discount.minPurchase` | Minimal belanja |
| | `discount.percent` | Besar diskon (%) |

Ubah `active: true` menjadi `active: false` untuk mematikan promo. Keranjang, form alamat, dan pesan WA ikut menyesuaikan otomatis.

## Event Meta Pixel

`PageView`, `AddToCart`, `InitiateCheckout`, `Purchase` (saat pesanan dikirim ke WA).
