import cv2
import os
import uuid
import config
from ultralytics import YOLO

# Load model secara global
MODEL_PATH = "best.pt"
model = YOLO(MODEL_PATH, task='detect')

def analyze_parking(file_path: str, save_result: bool = True) -> dict:
    ext = file_path.rsplit(".", 1)[-1].lower()
    if ext in {"mp4", "avi", "mov", "mkv", "webm"}:
        return analyze_video(file_path, save_result)
    else:
        return analyze_image(file_path, save_result)

def analyze_video(video_path: str, save_result: bool = True) -> dict:
    """
    Analisis video parkiran menggunakan model YOLO lokal.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise Exception("Gagal membuka video.")

    fps = int(cap.get(cv2.CAP_PROP_FPS))
    if fps <= 0:
        fps = 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    
    # Ensure video dimensions are even numbers for codec compatibility
    out_width = width if width % 2 == 0 else width - 1
    out_height = height if height % 2 == 0 else height - 1
    
    # Preprocessing: Skip frame (proses 1 dari tiap N frame) untuk mengurangi beban
    process_every_n_frames = max(1, fps // 10) # Target sekitar 10 FPS
    out_fps = max(1, fps // process_every_n_frames)
    
    result_video_url = None
    out = None
    if save_result:
        os.makedirs(config.RESULT_FOLDER, exist_ok=True)
        filename = f"result_{uuid.uuid4().hex[:8]}.webm"
        output_path = os.path.join(config.RESULT_FOLDER, filename)
        # VP80 (webm) works well in HTML5 browsers
        fourcc = cv2.VideoWriter_fourcc(*'vp80')
        out = cv2.VideoWriter(output_path, fourcc, out_fps, (out_width, out_height))
        result_video_url = f"/static/results/{filename}"

    empty_count = 0
    occupied_count = 0
    slots = []
    timeline = []
    
    # Optional: limit frames if video is too long, to prevent memory/timeout issues
    max_processed_frames = 150 # Maksimal memproses 150 frame
    processed_count = 0
    frame_idx = 0
    
    while cap.isOpened() and processed_count < max_processed_frames:
        ret, frame = cap.read()
        if not ret:
            break
            
        # Lewati frame untuk memperingan komputasi
        if frame_idx % process_every_n_frames != 0:
            frame_idx += 1
            continue
            
        frame_idx += 1
        
        # Ensure frame matches output dimensions if we had to adjust for odd sizes
        if frame.shape[1] != out_width or frame.shape[0] != out_height:
            frame = cv2.resize(frame, (out_width, out_height))
            
        results = model(frame, verbose=False)
        result = results[0]
        
        current_empty = 0
        current_occupied = 0
        current_slots = []
        
        for i, box in enumerate(result.boxes):
            cls_id = int(box.cls[0])
            label = result.names[cls_id]
            conf = round(float(box.conf[0]), 4)
            
            xywh = box.xywh[0].cpu().numpy()
            xyxy = box.xyxy[0].cpu().numpy()
            
            x, y, w, h = xywh
            x1, y1, x2, y2 = xyxy

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
                "bbox"      : {
                    "x": float(x), "y": float(y),
                    "width": float(w), "height": float(h),
                    "x1": int(x1), "y1": int(y1),
                    "x2": int(x2), "y2": int(y2),
                }
            })
            
        empty_count = current_empty
        occupied_count = current_occupied
        slots = current_slots
        
        if save_result and out is not None:
            img_bgr = result.plot(line_width=2)
            _draw_summary_bar(img_bgr, empty_count, occupied_count)
            out.write(img_bgr)
            
        timeline.append({
            "time": round(processed_count / out_fps, 3),
            "empty": empty_count,
            "occupied": occupied_count,
            "total_slots": len(current_slots),
            "occupancy_rate": round(occupied_count / len(current_slots) * 100, 1) if current_slots else 0,
            "slots": current_slots
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
        "result_image"  : result_video_url, # Menggunakan field yang sama agar frontend tidak perlu banyak diubah
        "is_video"      : True
    }


def analyze_image(image_path: str, save_result: bool = True) -> dict:
    """
    Analisis gambar parkiran: deteksi slot kosong dan terisi menggunakan model YOLO lokal.

    Args:
        image_path : Path gambar yang akan dianalisis
        save_result: Jika True, simpan gambar hasil anotasi

    Returns:
        dict berisi total_slots, empty, occupied, occupancy_rate, slots, result_image
    """
    # 1. Jalankan inferensi menggunakan YOLO
    results = model(image_path)
    result = results[0]

    # 2. Hitung & kumpulkan data tiap slot
    empty_count    = 0
    occupied_count = 0
    slots          = []

    for i, box in enumerate(result.boxes):
        cls_id = int(box.cls[0])
        label = result.names[cls_id]
        conf  = round(float(box.conf[0]), 4)
        
        xywh = box.xywh[0].cpu().numpy()
        xyxy = box.xyxy[0].cpu().numpy()
        
        x, y, w, h = xywh
        x1, y1, x2, y2 = xyxy

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
            "bbox"      : {
                "x": float(x), "y": float(y),
                "width": float(w), "height": float(h),
                "x1": int(x1), "y1": int(y1),
                "x2": int(x2), "y2": int(y2),
            }
        })

    # 3. Simpan gambar hasil
    result_image_url = None
    if save_result:
        # Gunakan fungsi plot bawaan YOLO untuk menggambar bounding box
        img_bgr = result.plot()
        result_image_url = _save_visualization(img_bgr, empty_count, occupied_count)

    total = len(slots)
    return {
        "total_slots"   : total,
        "empty"         : empty_count,
        "occupied"      : occupied_count,
        "occupancy_rate": round(occupied_count / total * 100, 1) if total else 0,
        "slots"         : slots,
        "result_image"  : result_image_url,
        "is_video"      : False
    }


def _get_annotation_scale(img_bgr):
    """Hitung skala anotasi berdasarkan ukuran gambar agar proporsional."""
    h, w = img_bgr.shape[:2]
    ref = min(w, h)
    # Skala kecil agar anotasi tidak mendominasi gambar
    font_scale = max(ref / 2000, 0.25)
    thickness  = max(int(ref / 800), 1)
    return font_scale, thickness


def _draw_summary_bar(img_bgr, empty: int, occupied: int):
    """Tambahkan bar ringkasan kecil semi-transparan di pojok kiri atas."""
    font_scale, thickness = _get_annotation_scale(img_bgr)
    font = cv2.FONT_HERSHEY_SIMPLEX

    texts = [
        (f"Empty: {empty}",    (0, 200, 0)),
        (f"Occupied: {occupied}", (0, 0, 220)),
    ]

    pad_x, pad_y = 6, 4
    y_offset = pad_y
    for text, color in texts:
        (tw, th), baseline = cv2.getTextSize(text, font, font_scale, thickness)
        # Background semi-transparan
        overlay = img_bgr.copy()
        cv2.rectangle(overlay, (0, y_offset), (tw + pad_x * 2, y_offset + th + baseline + pad_y * 2), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.5, img_bgr, 0.5, 0, img_bgr)
        # Teks
        cv2.putText(img_bgr, text, (pad_x, y_offset + th + pad_y), font, font_scale, color, thickness, cv2.LINE_AA)
        y_offset += th + baseline + pad_y * 2 + 2


def _save_visualization(img_bgr, empty: int, occupied: int) -> str:
    """Simpan gambar visualisasi + tambahkan teks ringkasan kecil."""
    _draw_summary_bar(img_bgr, empty, occupied)

    os.makedirs(config.RESULT_FOLDER, exist_ok=True)
    filename    = f"result_{uuid.uuid4().hex[:8]}.jpg"
    output_path = os.path.join(config.RESULT_FOLDER, filename)
    cv2.imwrite(output_path, img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
    return f"/static/results/{filename}"
