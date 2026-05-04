import os


# =============================================
# App Configuration
# =============================================
UPLOAD_FOLDER          = "static/uploads"
RESULT_FOLDER          = "static/results"
ALLOWED_EXTENSIONS     = {"png", "jpg", "jpeg", "mp4", "avi", "mov", "mkv", "webm"}
MAX_FILE_SIZE_MB       = 100

# Label class dari YOLO model
CLASS_EMPTY            = "empty"      # Label untuk slot kosong
CLASS_OCCUPIED         = "occupied"   # Label untuk slot terisi (ada mobil)
