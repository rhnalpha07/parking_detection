# ParkVision — Parking Detection API

Sistem deteksi slot parkir berbasis **YOLOv8 ONNX** dengan REST API Flask dan Web UI interaktif.
Model mendeteksi dua kelas: **empty** (slot kosong) dan **occupied** (slot terisi kendaraan).

---

## Fitur

- Upload gambar & video parkiran (JPG/PNG/MP4/AVI/WEBM)
- Inferensi via ONNX Runtime — cepat, tanpa PyTorch runtime di server
- Dashboard real-time: total slot, empty, occupied, occupancy rate
- Timeline video sync — statistik otomatis update mengikuti pemutaran video
- Conflict resolution: deteksi ganda empty+occupied pada slot sama otomatis diselesaikan
- Object tracking dengan bounding box smoothing antar frame
- Output gambar/video teranotasi (bounding box + label + confidence)

---

## Struktur Proyek

`
parking_api_updated_v1/
│
├── app.py                  # Entry point Flask
├── config.py               # Konfigurasi global (threshold, folder, label)
├── requirements.txt        # Dependensi Python
├── best_final.onnx         # Model aktif — letakkan di sini (root directory)
│
├── routes/
│   ├── detect.py           # POST /api/detect
│   └── status.py           # GET /api/health, GET /api/
│
├── services/
│   └── parking_service.py  # Core: ONNX inference, tracking, video processing
│
├── utils/
│   ├── file_helper.py      # Upload handler & cleanup
│   └── response_helper.py  # Format JSON response
│
└── static/
    ├── index.html          # Web UI (ParkVision frontend)
    ├── css/                # Stylesheet
    ├── js/
    │   ├── app.js          # Frontend: upload, API call, dashboard, GSAP animations
    │   └── hero3d.js       # Animasi 3D hero section (Three.js)
    ├── libs/               # Library frontend (GSAP, Three.js)
    ├── uploads/            # Temporary upload — auto cleanup setelah proses
    └── results/            # Hasil anotasi gambar/video
`

---

## Instalasi

### Prasyarat
- Python 3.9+

### Setup

`ash
# Clone repository
git clone https://github.com/rhnalpha07/parking_detection.git
cd parking_api_updated_v1

# Buat virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/macOS

# Install dependensi
pip install -r requirements.txt

# Letakkan model di ROOT directory (sejajar app.py)
# Salin best_final.onnx ke: parking_api_updated_v1/best_final.onnx
`

### Jalankan Server

`ash
python app.py
`

Akses di: **http://localhost:5000**

---

## Dependensi

| Package | Versi | Kegunaan |
|---|---|---|
| lask | 3.0.3 | Web framework & API server |
| lask-cors | 4.0.1 | CORS support untuk frontend |
| opencv-python-headless | 4.10.0.84 | Pemrosesan gambar & video, NMS |
| onnxruntime | latest | Inferensi model ONNX |
| 
umpy | latest | Operasi array & preprocessing |

---

## API Reference

### GET /api/health

Cek status API dan model.

**Response:**
`json
{
  "status": "success",
  "message": "API berjalan dengan baik.",
  "data": {
    "api": "Parking Detection API",
    "version": "1.0.0",
    "model": "local_yolo_v8"
  }
}
`

---

### POST /api/detect

Deteksi slot parkir dari gambar atau video.

**Request (multipart/form-data):**

| Field | Type | Keterangan |
|---|---|---|
| image | ile | Gambar (JPG/PNG) atau video (MP4/AVI/WEBM/MOV/MKV) — **wajib** |
| save_result | string | "true" / "false" — simpan hasil anotasi (default: "true") |

**Response (gambar):**
`json
{
  "status": "success",
  "message": "Deteksi parkiran berhasil.",
  "data": {
    "total_slots": 20,
    "empty": 8,
    "occupied": 12,
    "occupancy_rate": 60.0,
    "is_video": false,
    "result_image": "/static/results/result_abc123.jpg",
    "slots": [
      {
        "slot_id": 1,
        "status": "occupied",
        "label": "occupied",
        "confidence": 0.9231,
        "bbox": {
          "x": 145.5, "y": 89.3,
          "width": 120.0, "height": 80.0,
          "x1": 85, "y1": 49, "x2": 205, "y2": 129
        }
      }
    ]
  }
}
`

**Response (video)** — sama seperti gambar, ditambah field 	imeline:
`json
{
  "data": {
    "is_video": true,
    "result_image": "/static/results/result_xyz.mp4",
    "timeline": [
      {
        "time": 0.0,
        "empty": 8,
        "occupied": 12,
        "total_slots": 20,
        "occupancy_rate": 60.0,
        "slots": [...]
      }
    ]
  }
}
`

---

## Konfigurasi Threshold

Semua threshold dikonfigurasi di config.py:

| Parameter | Nilai | Penjelasan |
|---|---|---|
| CONF_THRESH | **0.45** | Confidence minimum — sudah di-tune untuk est_final.onnx. Cukup tinggi untuk menekan false positive tanpa melewatkan deteksi valid. |
| IOU_THRESH | **0.45** | IoU threshold untuk Non-Maximum Suppression — optimal untuk slot parkir yang berdekatan. |
| OVERLAP_THRESH | **0.40** | Jika >=40% area box empty tertutup box occupied, box empty dihapus (conflict resolution). |

### Parameter Video Processing (parking_service.py)

| Parameter | Nilai | Penjelasan |
|---|---|---|
| max_processed_frames | **200** | Maksimal frame yang diproses per video |
| process_every_n_frames | ps // 10 | Proses ~10 frame/detik untuk efisiensi |
| Tracker iou_thresh | **0.3** | IoU minimum untuk matching objek antar frame |
| Tracker max_disappeared | **3** | Frame maksimal objek hilang sebelum di-deregister |
| Tracker smoothing | **0.7** | Faktor smoothing bbox (0=tidak smooth, 1=freeze) |

---

## Model

| Properti | Detail |
|---|---|
| **File** | est_final.onnx (di root directory) |
| **Arsitektur** | YOLOv8 |
| **Input size** | 640x640 px |
| **Input format** | RGB float32 [0,1], shape [1, 3, 640, 640] |
| **Output format** | [1, 6, 8400] — cx, cy, w, h, conf_empty, conf_occupied |
| **Classes** | 0: empty, 1: occupied |
| **Preprocessing** | Letterbox resize + padding warna (114,114,114) |

---

## Format File yang Didukung

| Tipe | Ekstensi |
|---|---|
| Gambar | .jpg, .jpeg, .png |
| Video | .mp4, .avi, .mov, .mkv, .webm |
| Ukuran maksimal | 100 MB |

---

## Catatan Deployment

- Model est_final.onnx **harus ada di root directory** (sejajar pp.py)
- Folder static/uploads/ dan static/results/ dibuat otomatis jika belum ada
- File upload dihapus otomatis setelah diproses
- **Windows**: openh264-1.8.0-win64.dll otomatis didownload jika belum ada — diperlukan untuk output video H.264 yang kompatibel dengan browser
- **GPU inference**: install onnxruntime-gpu + pastikan CUDA tersedia; fallback ke CPU otomatis

---

*Proyek akademik — Mata Kuliah Pengolahan Citra Digital, Semester 6.*
*Inference berjalan 100% lokal — tidak ada data yang dikirim ke server eksternal.*
