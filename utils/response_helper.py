from flask import jsonify


def success_response(data: dict, message: str = "OK", status_code: int = 200):
    """Format response sukses standar."""
    return jsonify({
        "status" : "success",
        "message": message,
        "data"   : data
    }), status_code


def error_response(message: str, status_code: int = 400):
    """Format response error standar."""
    return jsonify({
        "status" : "error",
        "message": message,
        "data"   : None
    }), status_code
