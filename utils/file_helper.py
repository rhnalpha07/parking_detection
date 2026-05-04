import os
import uuid
import config


def allowed_file(filename: str) -> bool:
    """Cek apakah ekstensi file diperbolehkan."""
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in config.ALLOWED_EXTENSIONS
    )


def save_upload(file) -> str:
    """
    Simpan file upload ke folder uploads dengan nama unik.

    Args:
        file: FileStorage object dari Flask request

    Returns:
        Path absolut file yang disimpan
    """
    os.makedirs(config.UPLOAD_FOLDER, exist_ok=True)
    ext      = file.filename.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    path     = os.path.join(config.UPLOAD_FOLDER, filename)
    file.save(path)
    return path


def cleanup_file(path: str):
    """Hapus file sementara setelah diproses."""
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception:
        pass
