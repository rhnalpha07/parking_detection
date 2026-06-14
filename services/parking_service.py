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
MODEL_PATH   = "best_final.onnx"  # Model di root directory
CONF_THRESH  = getattr(config, "CONF_THRESH", 0.30)   # Minimum confidence threshold untuk deteksi
IOU_THRESH   = getattr(config, "IOU_THRESH",  0.45)   # IoU threshold untuk NMS
OVERLAP_THRESH = getattr(config, "OVERLAP_THRESH", 0.40)  # Conflict suppression overlap ratio
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


def _resolve_class_conflicts(detections: list) -> list:
    """
    Jika ada box 'empty' yang tumpang tindih secara signifikan dengan box 'occupied'
    (artinya terdeteksi mobil di slot tersebut), hapus box 'empty' tersebut.
    """
    occupied_dets = [d for d in detections if d["cls_id"] == 1]
    empty_dets    = [d for d in detections if d["cls_id"] == 0]

    resolved_empty = []
    for e_det in empty_dets:
        e_box = e_det["bbox"]
        is_suppressed = False
        for o_det in occupied_dets:
            o_box = o_det["bbox"]

            # Hitung persentase area 'empty' yang tertutup oleh 'occupied'
            xA = max(o_box["x1"], e_box["x1"])
            yA = max(o_box["y1"], e_box["y1"])
            xB = min(o_box["x2"], e_box["x2"])
            yB = min(o_box["y2"], e_box["y2"])

            inter_area = max(0, xB - xA) * max(0, yB - yA)
            empty_area = (e_box["x2"] - e_box["x1"]) * (e_box["y2"] - e_box["y1"])

            if empty_area > 0:
                overlap_ratio = inter_area / float(empty_area)
                if overlap_ratio > OVERLAP_THRESH:  # Suppress jika lebih dari 40% area empty tertutup
                    is_suppressed = True
                    break
        if not is_suppressed:
            resolved_empty.append(e_det)

    return occupied_dets + resolved_empty


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

    # Saring konflik tumpang tindih antara occupied dan empty
    detections = _resolve_class_conflicts(detections)
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


# ============================================================
# Object Tracking untuk mengurangi flickering
# ============================================================
def _compute_iou(boxA, boxB):
    xA = max(boxA["x1"], boxB["x1"])
    yA = max(boxA["y1"], boxB["y1"])
    xB = min(boxA["x2"], boxB["x2"])
    yB = min(boxA["y2"], boxB["y2"])
    interArea = max(0, xB - xA) * max(0, yB - yA)
    boxAArea = boxA["width"] * boxA["height"]
    boxBArea = boxB["width"] * boxB["height"]
    if float(boxAArea + boxBArea - interArea) == 0:
        return 0.0
    return interArea / float(boxAArea + boxBArea - interArea)

class SimpleIoUTracker:
    def __init__(self, iou_thresh=0.3, max_disappeared=3, smoothing=0.8):
        self.next_obj_id = 0
        self.objects = {}       # id -> det
        self.disappeared = {}   # id -> count
        self.iou_thresh = iou_thresh
        self.max_disappeared = max_disappeared
        self.smoothing = smoothing # 0 to 1, higher = smoother

    def update(self, detections):
        if len(detections) == 0:
            for obj_id in list(self.disappeared.keys()):
                self.disappeared[obj_id] += 1
                if self.disappeared[obj_id] > self.max_disappeared:
                    self.deregister(obj_id)
            return list(self.objects.values())
        
        if len(self.objects) == 0:
            for i in range(len(detections)):
                self.register(detections[i])
            return list(self.objects.values())

        object_ids = list(self.objects.keys())
        object_dets = list(self.objects.values())

        iou_matrix = np.zeros((len(object_ids), len(detections)))
        for i, obj_det in enumerate(object_dets):
            for j, det in enumerate(detections):
                if obj_det["cls_id"] == det["cls_id"]: # Sama class
                    iou_matrix[i, j] = _compute_iou(obj_det["bbox"], det["bbox"])

        used_rows = set()
        used_cols = set()

        # Sort matrix desc for greedy matching
        for _ in range(min(iou_matrix.shape[0], iou_matrix.shape[1])):
            idx = np.unravel_index(np.argmax(iou_matrix), iou_matrix.shape)
            if iou_matrix[idx] < self.iou_thresh:
                break
            
            row, col = idx
            if row in used_rows or col in used_cols:
                iou_matrix[row, col] = 0 # invalidate
                continue

            obj_id = object_ids[row]
            old_bbox = self.objects[obj_id]["bbox"]
            new_bbox = detections[col]["bbox"]
            
            # Smooth bounding box
            smoothed_bbox = {
                "x1": int(old_bbox["x1"] * self.smoothing + new_bbox["x1"] * (1 - self.smoothing)),
                "y1": int(old_bbox["y1"] * self.smoothing + new_bbox["y1"] * (1 - self.smoothing)),
                "x2": int(old_bbox["x2"] * self.smoothing + new_bbox["x2"] * (1 - self.smoothing)),
                "y2": int(old_bbox["y2"] * self.smoothing + new_bbox["y2"] * (1 - self.smoothing)),
            }
            smoothed_bbox["width"] = smoothed_bbox["x2"] - smoothed_bbox["x1"]
            smoothed_bbox["height"] = smoothed_bbox["y2"] - smoothed_bbox["y1"]
            smoothed_bbox["x"] = smoothed_bbox["x1"] + smoothed_bbox["width"] / 2
            smoothed_bbox["y"] = smoothed_bbox["y1"] + smoothed_bbox["height"] / 2
            
            detections[col]["bbox"] = smoothed_bbox
            self.objects[obj_id] = detections[col]
            self.disappeared[obj_id] = 0
            
            used_rows.add(row)
            used_cols.add(col)
            iou_matrix[row, :] = 0
            iou_matrix[:, col] = 0

        # Register new objects
        unused_cols = set(range(iou_matrix.shape[1])).difference(used_cols)
        for col in unused_cols:
            self.register(detections[col])

        # Deregister old objects
        unused_rows = set(range(iou_matrix.shape[0])).difference(used_rows)
        for row in unused_rows:
            obj_id = object_ids[row]
            self.disappeared[obj_id] += 1
            if self.disappeared[obj_id] > self.max_disappeared:
                self.deregister(obj_id)

        return list(self.objects.values())

    def register(self, detection):
        self.objects[self.next_obj_id] = detection
        self.disappeared[self.next_obj_id] = 0
        self.next_obj_id += 1

    def deregister(self, obj_id):
        del self.objects[obj_id]
        del self.disappeared[obj_id]


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

    max_processed_frames = 200
    processed_count = 0
    frame_idx       = 0
    
    tracker = SimpleIoUTracker(iou_thresh=0.3, max_disappeared=3, smoothing=0.7)

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
        detections = tracker.update(detections)

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
