import cv2
import os
import uuid
import config
import urllib.request
import bz2
import numpy as np
import onnxruntime as ort

# ============================================================
# Cek & Download OpenH264 DLL (dibutuhkan OpenCV di Windows
# untuk render video H.264 agar bisa diputar di browser)
# ============================================================
DLL_NAME = "openh264-1.8.0-win64.dll"
if os.name == 'nt' and not os.path.exists(DLL_NAME):
    print(f"[*] Mendownload {DLL_NAME} untuk dukungan video H.264 di browser...")
    try:
        urllib.request.urlretrieve(
            f"https://github.com/cisco/openh264/releases/download/v1.8.0/{DLL_NAME}.bz2",
            f"{DLL_NAME}.bz2"
        )
        with open(DLL_NAME, 'wb') as new_file, bz2.BZ2File(f"{DLL_NAME}.bz2", 'rb') as file:
            new_file.write(file.read())
        os.remove(f"{DLL_NAME}.bz2")
        print("[*] Selesai mendownload OpenH264 DLL.")
    except Exception as e:
        print(f"[!] Gagal mendownload {DLL_NAME}: {e}")

# ============================================================
# Konfigurasi ONNX Model
# ============================================================
MODEL_PATH   = os.path.join("models", "best_final.onnx")
CONF_THRESH  = 0.25   # Minimum confidence threshold
IOU_THRESH   = 0.45   # IoU threshold untuk NMS
INPUT_SIZE   = 640    # Ukuran input model (YOLOv8 default: 640x640)

# Mapping class index → nama label (sesuai urutan saat training)
# Index 0 = empty, Index 1 = occupied  (sesuaikan jika urutannya berbeda)
CLASS_NAMES  = {0: config.CLASS_EMPTY, 1: config.CLASS_OCCUPIED}

# ============================================================
# Load ONNX Session (global, sekali saat startup)
# ============================================================
providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
print(f"[*] Memuat ONNX model dari: {MODEL_PATH}")
try:
    session = ort.InferenceSession(MODEL_PATH, providers=providers)
    input_name  = session.get_inputs()[0].name
    output_name = session.get_outputs()[0].name
    _model_input_shape = session.get_inputs()[0].shape  # e.g. [1, 3, 640, 640]
    print(f"[*] ONNX model berhasil dimuat. Input: {input_name} {_model_input_shape}")
    print(f"[*] Provider aktif: {session.get_providers()}")
except Exception as e:
    print(f"[!] Gagal memuat ONNX model: {e}")
    session = None


# ============================================================
# Helper: Pre-processing & Post-processing ONNX
# ============================================================

def _preprocess(frame_bgr: np.ndarray):
    """
    Ubah frame BGR OpenCV menjadi tensor input ONNX [1, 3, H, W] float32.
    Mengembalikan (blob, scale_x, scale_y, pad_x, pad_y).
    Menggunakan letterbox agar aspect ratio terjaga.
    """
    orig_h, orig_w = frame_bgr.shape[:2]
    scale = min(INPUT_SIZE / orig_w, INPUT_SIZE / orig_h)
    new_w = int(orig_w * scale)
    new_h = int(orig_h * scale)

    resized = cv2.resize(frame_bgr, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    # Padding ke INPUT_SIZE x INPUT_SIZE (letterbox abu-abu 114)
    canvas = np.full((INPUT_SIZE, INPUT_SIZE, 3), 114, dtype=np.uint8)
    pad_x  = (INPUT_SIZE - new_w) // 2
    pad_y  = (INPUT_SIZE - new_h) // 2
    canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized

    # BGR → RGB, normalize ke [0, 1], CHW, batch
    blob = canvas[:, :, ::-1].astype(np.float32) / 255.0
    blob = np.transpose(blob, (2, 0, 1))
    blob = np.expand_dims(blob, axis=0)

    return blob, scale, scale, pad_x, pad_y


def _postprocess(output: np.ndarray, scale_x: float, scale_y: float,
                 pad_x: int, pad_y: int, orig_w: int, orig_h: int):
    """
    Proses output ONNX YOLOv8 → daftar deteksi dalam koordinat gambar asli.

    Output YOLOv8 ONNX shape: [1, num_classes+4, num_anchors]
    Setiap anchor: [cx, cy, w, h, cls0_conf, cls1_conf, ...]
    """
    # output shape: (1, 6, 8400)  → squeeze → (6, 8400) → transpose → (8400, 6)
    preds = output[0]                         # (num_classes+4, num_anchors)
    preds = np.transpose(preds, (1, 0))       # (num_anchors, num_classes+4)

    boxes_list  = []
    scores_list = []
    cls_list    = []

    for row in preds:
        cx, cy, w, h = row[0], row[1], row[2], row[3]
        class_scores = row[4:]                 # shape: (num_classes,)
        cls_id       = int(np.argmax(class_scores))
        conf         = float(class_scores[cls_id])

        if conf < CONF_THRESH:
            continue

        # De-letterbox: buang padding & undo scaling → koordinat gambar asli
        cx_orig = (cx - pad_x) / scale_x
        cy_orig = (cy - pad_y) / scale_y
        w_orig  = w / scale_x
        h_orig  = h / scale_y

        x1 = cx_orig - w_orig / 2
        y1 = cy_orig - h_orig / 2
        x2 = cx_orig + w_orig / 2
        y2 = cy_orig + h_orig / 2

        # Clamp ke batas gambar
        x1 = max(0, min(x1, orig_w))
        y1 = max(0, min(y1, orig_h))
        x2 = max(0, min(x2, orig_w))
        y2 = max(0, min(y2, orig_h))

        boxes_list.append([x1, y1, x2 - x1, y2 - y1])   # format [x, y, w, h] untuk NMS
        scores_list.append(conf)
        cls_list.append(cls_id)

    if not boxes_list:
        return []

    # Non-Maximum Suppression via OpenCV
    indices = cv2.dnn.NMSBoxes(
        bboxes    = boxes_list,
        scores    = scores_list,
        score_threshold = CONF_THRESH,
        nms_threshold   = IOU_THRESH,
    )

    detections = []
    if len(indices) > 0:
        for idx in indices.flatten():
            x, y, w, h = boxes_list[idx]
            x1, y1     = x, y
            x2, y2     = x + w, y + h
            cx, cy     = x + w / 2, y + h / 2
            detections.append({
                "cls_id": cls_list[idx],
                "conf"  : round(scores_list[idx], 4),
                "bbox"  : {
                    "x"     : float(cx),
                    "y"     : float(cy),
                    "width" : float(w),
                    "height": float(h),
                    "x1"    : int(x1),
                    "y1"    : int(y1),
                    "x2"    : int(x2),
                    "y2"    : int(y2),
                }
            })

    return detections


def _run_inference(frame_bgr: np.ndarray):
    """Jalankan inferensi ONNX pada satu frame BGR, kembalikan list deteksi."""
    if session is None:
        raise RuntimeError("ONNX session tidak tersedia. Cek apakah model berhasil dimuat.")

    orig_h, orig_w = frame_bgr.shape[:2]
    blob, sx, sy, px, py = _preprocess(frame_bgr)
    outputs = session.run([output_name], {input_name: blob})
    detections = _postprocess(outputs[0], sx, sy, px, py, orig_w, orig_h)
    return detections


def _draw_detections(frame_bgr: np.ndarray, detections: list) -> np.ndarray:
    """Gambar bounding box + label pada frame BGR."""
    img = frame_bgr.copy()
    COLOR_EMPTY    = (0, 200, 0)    # Hijau
    COLOR_OCCUPIED = (0, 0, 220)    # Merah

    for det in detections:
        bb     = det["bbox"]
        label  = CLASS_NAMES.get(det["cls_id"], f"cls{det['cls_id']}")
        conf   = det["conf"]
        color  = COLOR_OCCUPIED if label == config.CLASS_OCCUPIED else COLOR_EMPTY
        x1, y1, x2, y2 = bb["x1"], bb["y1"], bb["x2"], bb["y2"]

        cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
        text = f"{label} {conf:.2f}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
        cv2.rectangle(img, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        cv2.putText(img, text, (x1 + 2, y1 - 3),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    return img


# ============================================================
# Public API
# ============================================================

def analyze_parking(file_path: str, save_result: bool = True) -> dict:
    ext = file_path.rsplit(".", 1)[-1].lower()
    if ext in {"mp4", "avi", "mov", "mkv", "webm"}:
        return analyze_video(file_path, save_result)
    else:
        return analyze_image(file_path, save_result)


def analyze_video(video_path: str, save_result: bool = True) -> dict:
    """
    Analisis video parkiran menggunakan ONNX model.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Gagal membuka video.")

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    if fps <= 0:
        fps = 30
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Pastikan dimensi output genap (dibutuhkan codec H.264)
    out_width  = width  if width  % 2 == 0 else width  - 1
    out_height = height if height % 2 == 0 else height - 1

    # Proses ~10 FPS untuk efisiensi
    process_every_n_frames = max(1, fps // 10)
    out_fps = max(1, fps // process_every_n_frames)

    result_video_url = None
    out = None
    if save_result:
        os.makedirs(config.RESULT_FOLDER, exist_ok=True)
        filename    = f"result_{uuid.uuid4().hex[:8]}.mp4"
        output_path = os.path.join(config.RESULT_FOLDER, filename)
        fourcc      = cv2.VideoWriter_fourcc(*'avc1')
        out         = cv2.VideoWriter(output_path, fourcc, out_fps, (out_width, out_height))
        result_video_url = f"/static/results/{filename}"

    empty_count    = 0
    occupied_count = 0
    slots          = []
    timeline       = []

    max_processed_frames = 150
    processed_count = 0
    frame_idx       = 0

    while cap.isOpened() and processed_count < max_processed_frames:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % process_every_n_frames != 0:
            frame_idx += 1
            continue

        frame_idx += 1

        if frame.shape[1] != out_width or frame.shape[0] != out_height:
            frame = cv2.resize(frame, (out_width, out_height))

        detections = _run_inference(frame)

        current_empty    = 0
        current_occupied = 0
        current_slots    = []

        for i, det in enumerate(detections):
            label       = CLASS_NAMES.get(det["cls_id"], f"cls{det['cls_id']}")
            conf        = det["conf"]
            is_occupied = (label == config.CLASS_OCCUPIED)

            if is_occupied:
                current_occupied += 1
            else:
                current_empty += 1

            current_slots.append({
                "slot_id"   : i + 1,
                "status"    : "occupied" if is_occupied else "empty",
                "label"     : label,
                "confidence": conf,
                "bbox"      : det["bbox"],
            })

        empty_count    = current_empty
        occupied_count = current_occupied
        slots          = current_slots

        if save_result and out is not None:
            annotated = _draw_detections(frame, detections)
            _draw_summary_bar(annotated, empty_count, occupied_count)
            out.write(annotated)

        timeline.append({
            "time"          : round(processed_count / out_fps, 3),
            "empty"         : empty_count,
            "occupied"      : occupied_count,
            "total_slots"   : len(current_slots),
            "occupancy_rate": round(occupied_count / len(current_slots) * 100, 1) if current_slots else 0,
            "slots"         : current_slots,
        })

        processed_count += 1

    cap.release()
    if out is not None:
        out.release()

    total = len(slots)
    return {
        "total_slots"   : total,
        "empty"         : empty_count,
        "occupied"      : occupied_count,
        "occupancy_rate": round(occupied_count / total * 100, 1) if total else 0,
        "slots"         : slots,
        "timeline"      : timeline,
        "result_image"  : result_video_url,
        "is_video"      : True,
    }


def analyze_image(image_path: str, save_result: bool = True) -> dict:
    """
    Analisis gambar parkiran: deteksi slot kosong dan terisi menggunakan ONNX model.

    Args:
        image_path : Path gambar yang akan dianalisis
        save_result: Jika True, simpan gambar hasil anotasi

    Returns:
        dict berisi total_slots, empty, occupied, occupancy_rate, slots, result_image
    """
    frame = cv2.imread(image_path)
    if frame is None:
        raise Exception(f"Gagal membaca gambar: {image_path}")

    detections = _run_inference(frame)

    empty_count    = 0
    occupied_count = 0
    slots          = []

    for i, det in enumerate(detections):
        label       = CLASS_NAMES.get(det["cls_id"], f"cls{det['cls_id']}")
        conf        = det["conf"]
        is_occupied = (label == config.CLASS_OCCUPIED)

        if is_occupied:
            occupied_count += 1
        else:
            empty_count += 1

        slots.append({
            "slot_id"   : i + 1,
            "status"    : "occupied" if is_occupied else "empty",
            "label"     : label,
            "confidence": conf,
            "bbox"      : det["bbox"],
        })

    result_image_url = None
    if save_result:
        annotated        = _draw_detections(frame, detections)
        result_image_url = _save_visualization(annotated, empty_count, occupied_count)

    total = len(slots)
    return {
        "total_slots"   : total,
        "empty"         : empty_count,
        "occupied"      : occupied_count,
        "occupancy_rate": round(occupied_count / total * 100, 1) if total else 0,
        "slots"         : slots,
        "result_image"  : result_image_url,
        "is_video"      : False,
    }


# ============================================================
# Drawing Helpers
# ============================================================

def _get_annotation_scale(img_bgr):
    """Hitung skala anotasi berdasarkan ukuran gambar agar proporsional."""
    h, w   = img_bgr.shape[:2]
    ref    = min(w, h)
    font_scale = max(ref / 2000, 0.25)
    thickness  = max(int(ref / 800), 1)
    return font_scale, thickness


def _draw_summary_bar(img_bgr, empty: int, occupied: int):
    """Tambahkan bar ringkasan kecil semi-transparan di pojok kiri atas."""
    font_scale, thickness = _get_annotation_scale(img_bgr)
    font = cv2.FONT_HERSHEY_SIMPLEX

    texts = [
        (f"Empty: {empty}",       (0, 200, 0)),
        (f"Occupied: {occupied}", (0, 0, 220)),
    ]

    pad_x, pad_y = 6, 4
    y_offset = pad_y
    for text, color in texts:
        (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)
        overlay = img_bgr.copy()
        cv2.rectangle(overlay, (0, y_offset),
                      (tw + pad_x * 2, y_offset + th + baseline + pad_y * 2),
                      (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.5, img_bgr, 0.5, 0, img_bgr)
        cv2.putText(img_bgr, text, (pad_x, y_offset + th + pad_y),
                    font, font_scale, color, thickness, cv2.LINE_AA)
        y_offset += th + baseline + pad_y * 2 + 2


def _save_visualization(img_bgr, empty: int, occupied: int) -> str:
    """Simpan gambar visualisasi + tambahkan teks ringkasan kecil."""
    _draw_summary_bar(img_bgr, empty, occupied)

    os.makedirs(config.RESULT_FOLDER, exist_ok=True)
    filename    = f"result_{uuid.uuid4().hex[:8]}.jpg"
    output_path = os.path.join(config.RESULT_FOLDER, filename)
    cv2.imwrite(output_path, img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return f"/static/results/{filename}"
