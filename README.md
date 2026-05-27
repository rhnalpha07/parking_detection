# ParkVision - Premium Parking Detection API & Interface

ParkVision adalah aplikasi web premium modern untuk mendeteksi slot parkir kosong (`empty`) dan terisi (`occupied`) dari media gambar atau video secara realtime. Sistem ini menggunakan backend **Flask** dengan model computer vision **YOLOv8** lokal (`best.pt`), serta antarmuka web (frontend) mutakhir yang responsif dan interaktif.

Dokumentasi ini ditulis agar tim pengembang dapat dengan mudah melakukan kloning dan menjalankan aplikasi tanpa kendala konfigurasi.

---

## 🚀 Fitur Unggulan

- **Premium UI/UX Design**: Antarmuka futuristik dengan tema gelap (dark-tech), efek glassmorphism, responsive grid, serta interaktivitas penuh.
- **3D Perspective Hero**: Elemen dekoratif interaktif di halaman utama yang bergerak mengikuti arah kursor untuk memberikan kesan modern dan mahal.
- **Deteksi Gambar**: API memproses gambar, menghitung jumlah slot, dan mengembalikan anotasi visual bounding box beserta statistik *occupancy rate*.
- **Deteksi Video**: Mendukung analisis video dengan pemrosesan frame yang dioptimalkan (~10 FPS, maks 150 frame) serta menghasilkan output video `.webm` dan *timeline* status okupansi interaktif.
- **Clean Repository**: Konfigurasi `.gitignore` yang ketat agar file sampah hasil deteksi statis, cache python, dan folder agent tidak mengotori repositori git saat dikembangkan.

---

## 🛠️ Arsitektur & Teknologi

- **Backend**: Python 3, Flask, Flask-CORS
- **Computer Vision**: Ultralytics YOLOv8, OpenCV (Headless)
- **Model Default**: `best.pt` (lokal di root folder)
- **Frontend**: HTML5, Vanilla CSS (Premium styling, HSL colors), Vanilla JavaScript (Interaksi 3D, Chart rendering, AJAX upload)

---

## 📂 Struktur Project

```text
parking_api_updated_v1/
|-- app.py                         # Entry point Flask & routing Web/API
|-- config.py                      # Konfigurasi folder, ekstensi file, dan nama label kelas
|-- requirements.txt               # Daftar dependensi Python
|-- best.pt                        # File model YOLOv8 (wajib ada di root)
|-- .env.example                   # Contoh konfigurasi environment
|-- .gitignore                     # Aturan pengecualian file untuk repositori git yang bersih
|
|-- routes/
|   |-- detect.py                  # Endpoint POST /api/detect
|   `-- status.py                  # Endpoint GET /api/ dan GET /api/health
|
|-- services/
|   `-- parking_service.py         # Inferensi YOLOv8, anotasi visual, dan analisis media
|
|-- utils/
|   |-- file_helper.py             # Validasi file, helper upload, dan pembersihan
|   `-- response_helper.py         # Format response JSON terstandar
|
`-- static/
    |-- index.html                 # Halaman utama ParkVision (Premium UI)
    |-- css/style.css              # Tata gaya modern (Glassmorphism & animations)
    |-- js/app.js                  # Logika upload, fetch API, tabel dinamis, & timeline
    |-- js/hero3d.js               # Efek 3D tilt interaktif pada section hero
    |-- img/                       # Aset gambar visual beresolusi tinggi
    |-- uploads/                   # Folder penampung upload sementara (diabaikan git)
    `-- results/                   # Folder hasil visualisasi deteksi (diabaikan git)
```

---

## 💻 Cara Instalasi & Menjalankan

### 1. Kloning Repositori
```bash
git clone <url-repositori-anda>
cd parking_api_updated_v1
```

### 2. Install Dependensi
Pastikan Python 3 telah terinstal di sistem Anda, lalu jalankan:
```bash
pip install -r requirements.txt
```

### 3. Aktifkan Akselerasi GPU (Penting untuk Pengguna NVIDIA GTX/RTX)
Secara default, instalasi `requirements.txt` mungkin hanya menginstal PyTorch versi CPU. Agar pemrosesan video jauh lebih cepat, ganti PyTorch Anda dengan versi CUDA (11.8):
```bash
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```
*(Lewati langkah ini jika Anda tidak memiliki GPU NVIDIA atau hanya menggunakan CPU).*

### 4. Jalankan Aplikasi
Jalankan Flask server lokal:
```bash
python app.py
```

Setelah server aktif, buka peramban Anda di alamat:
**[http://localhost:5000](http://localhost:5000)**

---

## ⚙️ Detail Konfigurasi (`config.py`)

Aplikasi ini dapat disesuaikan melalui file `config.py`:
```python
UPLOAD_FOLDER          = "static/uploads"
RESULT_FOLDER          = "static/results"
ALLOWED_EXTENSIONS     = {"png", "jpg", "jpeg", "mp4", "avi", "mov", "mkv", "webm"}
MAX_FILE_SIZE_MB       = 100

# Sesuaikan dengan nama kelas hasil training model YOLO Anda
CLASS_EMPTY            = "empty"      # Label untuk slot kosong
CLASS_OCCUPIED         = "occupied"   # Label untuk slot terisi (mobil/car)
```

---

## 📡 Panduan Endpoint API

### 1. GET `/api/health`
Mengecek status kesehatan server dan versi model.
**Contoh Response:**
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

### 2. POST `/api/detect`
Mengirim berkas gambar atau video untuk dianalisis oleh model.
- **Content-Type**: `multipart/form-data`
- **Payload**:
  - `image`: File (Gambar atau Video)
  - `save_result`: `true` atau `false` (Default: `true`)

**Contoh Response (Gambar):**
```json
{
  "status": "success",
  "message": "Deteksi parkiran berhasil.",
  "data": {
    "total_slots": 12,
    "empty": 4,
    "occupied": 8,
    "occupancy_rate": 66.7,
    "slots": [
      {
        "slot_id": 1,
        "status": "occupied",
        "label": "occupied",
        "confidence": 0.945,
        "bbox": { "x": 100.5, "y": 80.2, "width": 50, "height": 35, "x1": 75, "y1": 62, "x2": 125, "y2": 97 }
      }
    ],
    "result_image": "/static/results/result_8aef92a1.jpg",
    "is_video": false
  }
}
```

---

## ⚠️ Informasi Penting untuk Tim

1. **File Model (`best.pt`)**: File bobot model YOLOv8 `best.pt` wajib diletakkan di root direktori project sebelum menjalankan `app.py`.
2. **Ignored Files**: Ketika Anda mengkloning proyek, folder `static/results/` dan `static/uploads/` akan kosong. Folder-folder ini diabaikan oleh git agar file pengujian Anda tidak terunggah ke repositori.
3. **Format Video**: Hasil anotasi video akan disimpan dalam format `.mp4` menggunakan codec `avc1` (H.264) agar dapat langsung dirender dan diputar secara mulus pada semua browser HTML5 modern tanpa kendala kompatibilitas.
4. **Pembersihan Log & Temp**: File `debug.log`, folder `.agents/`, `.codex/`, dan file sementara `skills-lock.json` telah dimasukkan ke `.gitignore` sehingga git log tim akan tetap bersih dan terfokus pada fungsionalitas kode utama.

