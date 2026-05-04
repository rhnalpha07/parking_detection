from flask import Blueprint, request
from services.parking_service import analyze_parking
from utils.file_helper import allowed_file, save_upload, cleanup_file
from utils.response_helper import success_response, error_response

detect_bp = Blueprint("detect", __name__)


@detect_bp.route("/detect", methods=["POST"])
def detect():
    """
    Endpoint: POST /api/detect

    Body (form-data):
        image       : file gambar (jpg/png) — WAJIB
        save_result : "true"/"false" — simpan gambar anotasi (default: true)

    Response JSON:
        {
            "status"  : "success",
            "message" : "OK",
            "data": {
                "total_slots"    : 20,
                "empty"          : 8,
                "occupied"       : 12,
                "occupancy_rate" : 60.0,
                "slots"          : [ { slot_id, status, label, confidence, bbox } ],
                "result_image"   : "/static/results/result_abc123.jpg"
            }
        }
    """
    # Validasi ada file
    if "image" not in request.files:
        return error_response("Field 'image' tidak ditemukan di request.", 400)

    file = request.files["image"]

    if file.filename == "":
        return error_response("Tidak ada file yang dipilih.", 400)

    if not allowed_file(file.filename):
        return error_response("Format file tidak didukung. Gunakan JPG, PNG, atau Video (MP4/AVI/WEBM).", 415)

    # Simpan file sementara
    image_path = save_upload(file)

    # Parameter opsional
    save_result = request.form.get("save_result", "true").lower() == "true"

    try:
        result = analyze_parking(image_path, save_result=save_result)
        return success_response(result, "Deteksi parkiran berhasil.")
    except Exception as e:
        return error_response(f"Gagal memproses file: {str(e)}", 500)
    finally:
        # Hapus file upload sementara
        cleanup_file(image_path)
