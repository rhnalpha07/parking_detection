# ParkVision - Parking Detection API

ParkVision adalah aplikasi web sederhana untuk mendeteksi slot parkir kosong dan terisi dari gambar atau video. Backend dibuat dengan Flask, model deteksi memakai YOLO lokal dari file `parking_best.onnx`, dan frontend berada di folder `static/`.

Dokumentasi ini mengikuti isi project saat ini. Project ini memakai model lokal dan tidak membutuhkan layanan deteksi eksternal saat runtime.

## Fitur

- Web UI untuk upload gambar atau video area parkir.
- API deteksi dengan endpoint `POST /api/detect`.
- Deteksi status slot parkir: `empty` dan `occupied`.
- Ringkasan jumlah slot, slot kosong, slot terisi, dan occupancy rate.
- Output gambar anotasi untuk file gambar.
- Output video anotasi `.webm` dan timeline ringkasan untuk file video.
- Landing page premium dengan efek 3D berbasis CSS perspective dan vanilla JavaScript.

## Teknologi

- Python 3
- Flask
- Flask-CORS
- Ultralytics YOLO
- OpenCV headless
- HTML, CSS, JavaScript
- HTML, CSS, dan vanilla JavaScript untuk frontend.

## Struktur Project

```text
parking_api_updated_v1/
|-- app.py                         # Entry point Flask dan route halaman utama
|-- config.py                      # Konfigurasi folder, ekstensi file, dan label model
|-- requirements.txt               # Dependency Python
|-- parking_best.onnx              # Model YOLO lokal
|-- .env.example                   # Contoh env; tidak wajib untuk runtime saat ini
|
|-- routes/
|   |-- detect.py                  # Endpoint POST /api/detect
|   `-- status.py                  # Endpoint GET /api/ dan GET /api/health
|
|-- services/
|   `-- parking_service.py         # Inferensi YOLO, analisis gambar/video, simpan hasil
|
|-- utils/
|   |-- file_helper.py             # Validasi ekstensi, simpan upload, hapus file sementara
|   `-- response_helper.py         # Format response JSON sukses/error
|
`-- static/
    |-- index.html                 # Halaman web ParkVision
    |-- css/style.css              # Styling UI
    |-- js/app.js                  # Logic frontend upload, motion, fetch API, render hasil
    |-- uploads/                   # File upload sementara
    `-- results/                   # File hasil anotasi
```

## Cara Menjalankan

Jalankan perintah dari root project:

```bash
pip install -r requirements.txt
python app.py
```

Jika berhasil, buka:

```text
http://localhost:5000
```

Endpoint API tersedia di:

```text
http://localhost:5000/api/
```

## Catatan Konfigurasi

Konfigurasi utama ada di `config.py`:

```python
UPLOAD_FOLDER = "static/uploads"
RESULT_FOLDER = "static/results"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "mp4", "avi", "mov", "mkv", "webm"}
MAX_FILE_SIZE_MB = 100
CLASS_EMPTY = "empty"
CLASS_OCCUPIED = "car"
```

File model harus tersedia di root project:

```text
parking_best.onnx
```

Label class model yang dipakai kode adalah:

- `empty` untuk slot kosong.
- `car` untuk slot terisi.

Jika model memakai nama label berbeda, ubah `CLASS_EMPTY` dan `CLASS_OCCUPIED` di `config.py`.

## Web UI

Halaman utama berada di `static/index.html` dan dilayani oleh route `/`.

Alur penggunaan:

1. Buka `http://localhost:5000`.
2. Upload gambar atau video parkiran.
3. Klik tombol `Deteksi Parkiran`.
4. UI menampilkan statistik, occupancy bar, hasil anotasi, dan tabel detail slot.

Format yang diterima frontend:

- Gambar: JPG, JPEG, PNG.
- Video: MP4, AVI, MOV, WEBM.
- Ukuran maksimal: 100 MB.

## Endpoint API

### GET `/api/health`

Untuk mengecek apakah API berjalan.

Contoh response:

```json
{
  "status": "success",
  "message": "API berjalan dengan baik.",
  "data": {
    "api": "Parking Detection API",
    "version": "1.0.0",
    "model": "local_yolo_v8"
  }
}
```

### GET `/api/`

Untuk melihat daftar endpoint yang tersedia.

Contoh response:

```json
{
  "status": "success",
  "message": "Selamat datang di Parking Detection API.",
  "data": {
    "endpoints": [
      {
        "method": "GET",
        "path": "/api/health",
        "desc": "Cek status API"
      },
      {
        "method": "POST",
        "path": "/api/detect",
        "desc": "Deteksi parkiran dari gambar atau video"
      }
    ]
  }
}
```

### POST `/api/detect`

Untuk mendeteksi slot parkir dari gambar atau video.

Request memakai `multipart/form-data`.

| Field | Tipe | Wajib | Keterangan |
| --- | --- | --- | --- |
| `image` | file | Ya | File gambar atau video. Nama field tetap `image`, termasuk untuk video. |
| `save_result` | string | Tidak | Isi `"true"` atau `"false"`. Default `"true"`. |

Contoh request dengan curl:

```bash
curl -X POST http://localhost:5000/api/detect \
  -F "image=@parking_lot.jpg" \
  -F "save_result=true"
```

Contoh request dengan JavaScript:

```javascript
const formData = new FormData();
formData.append("image", fileInput.files[0]);
formData.append("save_result", "true");

const response = await fetch("http://localhost:5000/api/detect", {
  method: "POST",
  body: formData,
});

const json = await response.json();
console.log(json);
```

## Response Deteksi Gambar

Contoh response sukses untuk gambar:

```json
{
  "status": "success",
  "message": "Deteksi parkiran berhasil.",
  "data": {
    "total_slots": 3,
    "empty": 1,
    "occupied": 2,
    "occupancy_rate": 66.7,
    "slots": [
      {
        "slot_id": 1,
        "status": "occupied",
        "label": "occupied",
        "confidence": 0.9312,
        "bbox": {
          "x": 120.5,
          "y": 85.3,
          "width": 60.0,
          "height": 40.0,
          "x1": 90,
          "y1": 65,
          "x2": 150,
          "y2": 105
        }
      }
    ],
    "result_image": "/static/results/result_abc12345.jpg",
    "is_video": false
  }
}
```

Jika `save_result=false`, field `result_image` bernilai `null`.

## Response Deteksi Video

Untuk video, field `result_image` tetap dipakai agar frontend tidak perlu logic tambahan. Isinya adalah path video hasil anotasi.

Contoh response sukses untuk video:

```json
{
  "status": "success",
  "message": "Deteksi parkiran berhasil.",
  "data": {
    "total_slots": 4,
    "empty": 2,
    "occupied": 2,
    "occupancy_rate": 50.0,
    "slots": [],
    "timeline": [
      {
        "time": 0.0,
        "empty": 2,
        "occupied": 2,
        "total_slots": 4,
        "occupancy_rate": 50.0,
        "slots": []
      }
    ],
    "result_image": "/static/results/result_abc12345.webm",
    "is_video": true
  }
}
```

Catatan proses video:

- Video di-resize jika dimensinya terlalu besar.
- Frame tidak semuanya diproses; kode menargetkan sekitar 10 FPS agar lebih ringan.
- Maksimal frame yang diproses adalah 150 frame.
- Output video disimpan sebagai `.webm`.

## Response Error

Semua error memakai format:

```json
{
  "status": "error",
  "message": "Pesan error",
  "data": null
}
```

Kemungkinan error umum:

| Status HTTP | Penyebab |
| --- | --- |
| 400 | Field `image` tidak ada, atau file belum dipilih. |
| 413 | Ukuran file melebihi limit Flask 100 MB. |
| 415 | Ekstensi file tidak didukung. |
| 500 | File gagal diproses oleh model atau video gagal dibuka. |

## File Upload dan Hasil

Saat request masuk:

1. File upload disimpan sementara ke `static/uploads/`.
2. File diproses oleh model YOLO.
3. Jika `save_result=true`, hasil anotasi disimpan ke `static/results/`.
4. File upload sementara dihapus setelah proses selesai.

File di `static/results/` tidak otomatis dihapus oleh kode saat ini. Bersihkan folder tersebut secara manual jika ukurannya mulai besar.

## Troubleshooting

### Server lambat saat pertama dijalankan

Model YOLO dimuat saat aplikasi start. Waktu start bisa lebih lama tergantung ukuran `parking_best.onnx` dan spesifikasi komputer.

### Error karena `parking_best.onnx` tidak ditemukan

Pastikan file `parking_best.onnx` ada di root project, sejajar dengan `app.py`.

### Hasil kosong atau label tidak sesuai

Pastikan model memang mendeteksi label `empty` dan `car`. Jika label model berbeda, sesuaikan di `config.py`.

### Video tidak bisa dibuka

Pastikan format video didukung OpenCV di environment yang dipakai. Format yang paling aman untuk UI adalah MP4 atau WEBM.

### UI menampilkan API Offline saat dibuka lewat static server

UI memanggil `/api/health`. Jika halaman dibuka memakai static server biasa, endpoint Flask tidak tersedia. Jalankan dengan `python app.py` dan buka `http://localhost:5000`.

## Catatan untuk Developer

- Jangan ubah nama field upload `image` kecuali frontend dan dokumentasi ikut diubah.
- Untuk video, `result_image` memang berisi path video `.webm`; nama field dipertahankan untuk kompatibilitas frontend.
- Frontend memakai HTML, CSS, dan vanilla JavaScript tanpa framework.
- `.env.example` hanya contoh. Aplikasi saat ini tidak membaca credential dari `.env`.
