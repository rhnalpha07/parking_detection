# 🚗 Parking Detection API

API berbasis Flask untuk mendeteksi slot parkiran kosong dan terisi menggunakan model Roboflow.

---

## 📁 Struktur Project

```
parking_api/
│
├── app.py                      # Entry point Flask
├── config.py                   # Konfigurasi API key & settings
├── requirements.txt
├── .env.example
│
├── routes/
│   ├── detect.py               # POST /api/detect
│   └── status.py               # GET  /api/health, GET /api/
│
├── services/
│   ├── roboflow_service.py     # Komunikasi dengan Roboflow
│   └── parking_service.py      # Logika analisis parkiran + anotasi gambar
│
├── utils/
│   ├── file_helper.py          # Upload & cleanup file
│   └── response_helper.py      # Format response JSON
│
└── static/
    ├── uploads/                # File upload sementara
    └── results/                # Gambar hasil anotasi
```

---

## 🚀 Cara Menjalankan (Web UI & API)

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set API Key Roboflow
# Salin .env.example → .env lalu isi API key
cp .env.example .env

# Atau langsung edit config.py pada baris:
# ROBOFLOW_API_KEY = "MASUKKAN_API_KEY_KAMU_DISINI"

# 3. Jalankan server
python app.py
```

Setelah server berjalan, Anda dapat mengakses:
- **Web UI (ParkVision):** Buka browser dan akses `http://localhost:5000`
- **Base API Endpoint:** `http://localhost:5000/api`


---

## 🔌 Endpoint API

### `GET /api/health`
Cek status API.

**Response:**
```json
{
  "status": "success",
  "message": "API berjalan dengan baik.",
  "data": {
    "api": "Parking Detection API",
    "version": "1.0.0",
    "model": "parking-space-gaeau/1"
  }
}
```

---

### `POST /api/detect`
Deteksi slot parkiran dari gambar.

**Request (form-data):**
| Field        | Type   | Keterangan                              |
|-------------|--------|-----------------------------------------|
| `image`     | file   | Gambar parkiran (JPG/PNG) — **wajib**   |
| `save_result` | string | `"true"` / `"false"` (default: `true`) |

**Contoh dengan curl:**
```bash
curl -X POST http://localhost:5000/api/detect \
  -F "image=@parking_lot.jpg" \
  -F "save_result=true"
```

**Contoh dengan JavaScript (fetch):**
```javascript
const formData = new FormData();
formData.append("image", fileInput.files[0]);
formData.append("save_result", "true");

const res = await fetch("http://localhost:5000/api/detect", {
  method: "POST",
  body: formData,
});
const data = await res.json();
console.log(data);
```

**Response:**
```json
{
  "status": "success",
  "message": "Deteksi parkiran berhasil.",
  "data": {
    "total_slots": 20,
    "empty": 8,
    "occupied": 12,
    "occupancy_rate": 60.0,
    "slots": [
      {
        "slot_id": 1,
        "status": "occupied",
        "label": "car",
        "confidence": 0.9312,
        "bbox": { "x": 120, "y": 85, "width": 60, "height": 40, "x1": 90, "y1": 65, "x2": 150, "y2": 105 }
      }
    ],
    "result_image": "/static/results/result_abc12345.jpg"
  }
}
```

---

## 🌐 Akses Gambar Hasil

Gambar anotasi bisa diakses langsung via browser:
```
http://localhost:5000/static/results/result_abc12345.jpg
```
