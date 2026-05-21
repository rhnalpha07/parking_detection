from flask import Blueprint
from utils.response_helper import success_response
import config

status_bp = Blueprint("status", __name__)


@status_bp.route("/health", methods=["GET"])
def health():
    """
    Endpoint: GET /api/health
    Cek apakah API berjalan normal.
    """
    return success_response({
        "api"        : "Parking Detection API",
        "version"    : "1.0.0",
        "model"      : "local_yolo_v8",
    }, "API berjalan dengan baik.")


@status_bp.route("/", methods=["GET"])
def index():
    """
    Endpoint: GET /api/
    Daftar endpoint yang tersedia.
    """
    return success_response({
        "endpoints": [
            {"method": "GET",  "path": "/api/health",  "desc": "Cek status API"},
            {"method": "POST", "path": "/api/detect",  "desc": "Deteksi parkiran dari gambar atau video"},
        ]
    }, "Selamat datang di Parking Detection API.")
