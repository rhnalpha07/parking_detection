# ParkVision — Intelligent Parking Infrastructure

![ParkVision Banner](https://img.shields.io/badge/UI%2FUX-Agency_Premium-00e5ff?style=for-the-badge) ![YOLOv8](https://img.shields.io/badge/YOLO-v8-yellow?style=for-the-badge&logo=yolo) ![Flask](https://img.shields.io/badge/Backend-Flask-black?style=for-the-badge&logo=flask) ![GSAP](https://img.shields.io/badge/Motion-GSAP-88CE02?style=for-the-badge)

ParkVision adalah sistem cerdas untuk mendeteksi ketersediaan slot parkir secara real-time dari media gambar maupun video. Menggabungkan ketangguhan model **YOLOv8** di sisi *backend* (Flask) dengan antarmuka web berstandar **High-End Agency ($150k+ build)**.

Dokumentasi ini ditulis agar tim pengembang dapat dengan mudah melakukan kloning, menjalankan, serta mengembangkan aplikasi tanpa hambatan teknis.

---

## ✨ Fitur & Arsitektur Visual

Sistem ini didesain tidak hanya sekadar fungsional, tetapi mematuhi standar *Awwwards-Tier Design Engineering*:

- **Premium Dark-Tech UI**: Antarmuka futuristik dengan palet *deep OLED black*, efek *glassmorphism* tingkat lanjut, dan tipografi *variable-width* yang tajam.
- **Asymmetrical Bento Dashboard (7/5 Split)**: Hasil deteksi tidak ditampilkan secara kaku. Dashboard terbagi menjadi *viewport* media yang mendominasi (7-kolom) disandingkan dengan *live stats sidebar* (5-kolom).
- **Live Occupancy Ring Gauge**: Visualisasi tingkat keterisian parkir (okupansi) yang dinamis menggunakan *SVG stroke-dashoffset* animasi dan indikator warna adaptif (Hijau/Kuning/Merah).
- **Haptic Micro-interactions**: Menggunakan animasi berbasis kurva *cubic-bezier* khusus (`0.32, 0.72, 0, 1`) yang mensimulasikan hukum fisika (berat/massa) pada setiap interaksi *button hover*, nav-reveal, dan unggah file.
- **Deteksi Video Teroptimasi**: Pemrosesan *frame-by-frame* pintar via YOLOv8 (maks 150 frame, ~10 FPS) dengan *output* MP4 kompatibel (H.264).

---

## 🛠️ Tech Stack

### 🧠 Computer Vision & Backend
- **Ultralytics YOLOv8** (Custom Model `best.pt`)
- **Python 3.9+** & **Flask** (API & Routing)
- **OpenCV (Headless)** (Anotasi Bounding Box)

### 🎨 Frontend & Motion
- **HTML5 & Vanilla CSS** (Zero framework bloat, performa *hardware-accelerated*)
- **GSAP (GreenSock)** (ScrollTriggers & koreografi animasi fluid)
- **Three.js** (Efek 3D *Tilt* Interaktif di Hero Section)

---

## 🚀 Cara Instalasi (Local Development)

### 1. Kloning Repositori
Pastikan Anda berada di direktori *workspace* yang tepat, lalu eksekusi:
```bash
git clone https://github.com/rhnalpha07/parking_detection.git
cd parking_detection
```

### 2. Persiapan Dependensi
Sangat disarankan menggunakan *virtual environment* (`venv`). Install seluruh dependensi yang dibutuhkan:
```bash
pip install -r requirements.txt
```

### 3. Akselerasi GPU (Untuk Pengguna NVIDIA - Opsional tapi Direkomendasikan)
Secara bawaan, instalasi *requirements* memuat PyTorch versi CPU. Jika Anda memproses video, kecepatan akan meningkat drastis dengan versi CUDA:
```bash
pip uninstall torch torchvision torchaudio -y
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### 4. Menjalankan Server
Pastikan model kustom Anda (`best.pt`) sudah berada di dalam folder *root*. Jalankan server *development*:
```bash
python app.py
```
Akses antarmuka melalui peramban: **[http://localhost:5000](http://localhost:5000)**

---

## 📂 Struktur Proyek

```text
parking_detection/
├── app.py                         # Entry point Flask (Routing utama)
├── config.py                      # Konfigurasi parameter & rules direktori
├── best.pt                        # ⚠️ WAJIB: Weights dari YOLOv8 Model
├── requirements.txt               # Dependencies
├── routes/
│   ├── detect.py                  # Endpoint POST /api/detect (Inferensi AI)
│   └── status.py                  # Endpoint GET /api/health (Ping server)
├── services/
│   └── parking_service.py         # Inti logika OpenCV & deteksi YOLOv8
├── utils/
│   ├── file_helper.py             # I/O Helper & validasi ekstensi media
│   └── response_helper.py         # Standardisasi JSON API response
└── static/                        # Frontend Assets
    ├── index.html                 # Struktur markup High-End UI
    ├── css/style.css              # Styling (Double-Bezel, Bento Grid, Ring Gauge)
    ├── js/
    │   ├── app.js                 # Integrasi API, logika upload & GSAP
    │   └── hero3d.js              # Three.js canvas setup
    ├── img/                       # Aset statis & background
    ├── uploads/                   # (Git Ignored) Buffer unggahan user
    └── results/                   # (Git Ignored) Hasil rendering AI
```

---

## 📡 API Endpoints

Aplikasi mengekspos API yang dapat dikonsumsi oleh *client* eksternal:

| Method | Endpoint | Fungsi | Payload |
| :--- | :--- | :--- | :--- |
| **GET** | `/api/health` | Cek status server (dipakai indikator UI) | *None* |
| **POST** | `/api/detect` | Mengirim media untuk dianalisis model | `form-data` (`image`: file) |

**Contoh Response Sukses (`/api/detect`)**:
```json
{
  "status": "success",
  "data": {
    "total_slots": 12,
    "empty": 4,
    "occupied": 8,
    "occupancy_rate": 66.7,
    "slots": [
      {
        "slot_id": 1,
        "status": "occupied",
        "confidence": 0.94,
        "bbox": { "x1": 75, "y1": 62, "x2": 125, "y2": 97 }
      }
    ],
    "result_image": "/static/results/result_8aef92a1.jpg",
    "is_video": false
  }
}
```

---

## 🤝 Catatan Pengembangan (Dev Notes)
- Repositori ini menerapkan `.gitignore` yang sangat ketat. Folder `uploads/`, `results/`, dan *cache files* (`__pycache__`) tidak akan masuk ke dalam repositori demi menjaga *history* tetap bersih.
- Komponen visual UI dibangun **tanpa** *framework CSS utility* raksasa seperti Tailwind, melainkan dengan CSS murni agar abstraksi visual tingkat tinggi seperti `backdrop-filter`, *concentric border radii*, dan masking animasi dapat dimanipulasi per *pixel*.

---
*Developed with focus on privacy — inference runs 100% locally.*
