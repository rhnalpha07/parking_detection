from flask import Flask, send_from_directory
from flask_cors import CORS
from routes.detect import detect_bp
from routes.status import status_bp

app = Flask(__name__)
CORS(app)  # Allow requests from web frontend

app.config["UPLOAD_FOLDER"] = "static/uploads"
app.config["RESULT_FOLDER"] = "static/results"
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # Max 100MB upload

# Register Blueprints
app.register_blueprint(detect_bp, url_prefix="/api")
app.register_blueprint(status_bp, url_prefix="/api")


@app.route("/")
def index():
    """Serve the ParkVision web UI."""
    return send_from_directory("static", "index.html")


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
