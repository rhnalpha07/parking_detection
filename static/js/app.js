// ========== ParkVision - Smart Parking Detection ==========
const API_BASE = window.location.origin;
let selectedFile = null;
let slotsData = [];
let videoTimeline = null;
let lastRenderedTime = -1;

// ── DOM Elements ──
const $ = (s) => document.querySelector(s);
const dropZone = $("#dropZone");
const fileInput = $("#fileInput");
const previewContainer = $("#previewContainer");
const previewImage = $("#previewImage");
const previewVideo = $("#previewVideo");
const previewInfo = $("#previewInfo");
const dropZoneContent = $("#dropZoneContent");
const removePreview = $("#removePreview");
const detectBtn = $("#detectBtn");
const btnLoader = $("#btnLoader");
const resultsSection = $("#resultsSection");
const loadingOverlay = $("#loadingOverlay");
const toastContainer = $("#toastContainer");

// ── Init ──
document.addEventListener("DOMContentLoaded", () => {
  checkApiHealth();
  setupDropZone();
  setupDetectButton();
  setupFilters();
});

// ── API Health Check ──
async function checkApiHealth() {
  const statusDot = $(".status-dot");
  const statusText = $(".status-text");
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    if (data.status === "success") {
      statusDot.classList.add("online");
      statusText.textContent = "API Online";
    } else {
      statusDot.classList.add("offline");
      statusText.textContent = "API Error";
    }
  } catch {
    statusDot.classList.add("offline");
    statusText.textContent = "API Offline";
  }
}

// ── Drop Zone Setup ──
function setupDropZone() {
  dropZone.addEventListener("click", (e) => {
    if (e.target.closest(".preview-remove")) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropZone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
  });

  removePreview.addEventListener("click", (e) => {
    e.stopPropagation();
    clearFile();
  });
}

function handleFile(file) {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "video/mp4", "video/avi", "video/quicktime", "video/x-msvideo", "video/webm"];
  if (!allowed.includes(file.type)) {
    showToast("Format file tidak didukung. Gunakan JPG, PNG, atau Video (MP4/AVI/WEBM).", "error");
    return;
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast("Ukuran file terlalu besar. Maksimal 100MB.", "error");
    return;
  }

  selectedFile = file;
  const isVideo = file.type.startsWith("video/");
  
  if (isVideo) {
    const fileURL = URL.createObjectURL(file);
    previewVideo.src = fileURL;
    previewVideo.style.display = "block";
    previewImage.style.display = "none";
    
    previewContainer.style.display = "block";
    dropZoneContent.style.display = "none";
    previewInfo.textContent = `${file.name} • ${formatSize(file.size)}`;
    detectBtn.disabled = false;
  } else {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      previewImage.style.display = "block";
      previewVideo.style.display = "none";
      
      previewContainer.style.display = "block";
      dropZoneContent.style.display = "none";
      previewInfo.textContent = `${file.name} • ${formatSize(file.size)}`;
      detectBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  }
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  previewContainer.style.display = "none";
  previewImage.style.display = "none";
  previewVideo.style.display = "none";
  previewVideo.src = ""; // Stop video playback
  dropZoneContent.style.display = "flex";
  detectBtn.disabled = true;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// ── Detect Button ──
function setupDetectButton() {
  detectBtn.addEventListener("click", async () => {
    if (!selectedFile || detectBtn.disabled) return;
    await runDetection();
  });
}

async function runDetection() {
  // Show loading
  detectBtn.disabled = true;
  detectBtn.classList.add("loading");
  btnLoader.style.display = "inline-flex";
  loadingOverlay.style.display = "grid";
  
  const isVideo = selectedFile && selectedFile.type.startsWith("video/");
  const subtitle = $(".loading-subtitle");
  if (isVideo) {
    subtitle.textContent = "AI sedang menganalisis video (bisa memakan waktu beberapa saat)...";
  } else {
    subtitle.textContent = "AI sedang mendeteksi slot parkir dari gambar...";
  }

  // Simulate progress bar
  const progressBar = $("#loadingProgressBar");
  progressBar.style.width = "0%";
  progressBar.style.transition = "width 0.5s ease";
  
  let progress = 0;
  const progressInterval = setInterval(() => {
    // Slower progress for video
    const increment = isVideo ? (Math.random() * 2) : (Math.random() * 15);
    if (progress < 90) {
      progress += increment;
      progressBar.style.width = Math.min(progress, 90) + "%";
    }
  }, 500);

  const formData = new FormData();
  formData.append("image", selectedFile);
  formData.append("save_result", "true");

  try {
    const res = await fetch(`${API_BASE}/api/detect`, {
      method: "POST",
      body: formData,
    });
    const json = await res.json();

    if (json.status === "success") {
      clearInterval(progressInterval);
      progressBar.style.width = "100%";
      setTimeout(() => displayResults(json.data), 300); // Tunggu animasi bar selesai
      showToast("Deteksi parkiran berhasil!", "success");
    } else {
      clearInterval(progressInterval);
      showToast(json.message || "Terjadi kesalahan pada deteksi.", "error");
    }
  } catch (err) {
    clearInterval(progressInterval);
    showToast("Gagal terhubung ke server: " + err.message, "error");
  } finally {
    setTimeout(() => {
      detectBtn.disabled = false;
      detectBtn.classList.remove("loading");
      btnLoader.style.display = "none";
      loadingOverlay.style.display = "none";
      progressBar.style.width = "0%"; // Reset
    }, 400);
  }
}

// ── Display Results ──
function displayResults(data) {
  resultsSection.style.display = "block";

  // Animate scroll to results
  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);

  updateDashboardData(data, true);

  // Result image / video
  if (data.result_image) {
    const resultImg = $("#resultImage");
    const resultVid = $("#resultVideo");
    
    if (data.is_video) {
      resultVid.src = API_BASE + data.result_image;
      resultVid.style.display = "block";
      resultImg.style.display = "none";
      videoTimeline = data.timeline || null;
      lastRenderedTime = -1;
      $(".slots-card").style.display = "block"; // Tetap tampilkan tabel, tapi dirender sebagai ringkasan
    } else {
      resultImg.src = API_BASE + data.result_image;
      resultImg.style.display = "block";
      resultVid.style.display = "none";
      videoTimeline = null;
      $(".slots-card").style.display = "block";
    }
    $(".result-image-card").style.display = "block";
  }
}

function updateDashboardData(data, animate = false) {
  slotsData = data.slots || [];
  
  if (animate) {
    animateValue("statTotal", data.total_slots);
    animateValue("statEmpty", data.empty);
    animateValue("statOccupied", data.occupied);
    animateValue("statRate", data.occupancy_rate, "%");
  } else {
    $("#statTotal").textContent = data.total_slots;
    $("#statEmpty").textContent = data.empty;
    $("#statOccupied").textContent = data.occupied;
    $("#statRate").textContent = data.occupancy_rate + "%";
  }

  // Occupancy bar
  const rate = data.occupancy_rate || 0;
  $("#occupancyPercent").textContent = rate + "%";
  
  if (animate) {
    setTimeout(() => {
      $("#occupancyBarFill").style.width = rate + "%";
    }, 200);
  } else {
    $("#occupancyBarFill").style.width = rate + "%";
  }
  
  $("#legendEmpty").textContent = data.empty;
  $("#legendOccupied").textContent = data.occupied;

  // Slots table (Render sebagai ringkasan jika video, atau detail jika gambar)
  const activeFilter = document.querySelector(".filter-btn.active");
  renderSlotsTable(slotsData, activeFilter ? activeFilter.dataset.filter : "all");
}

function animateValue(id, target, suffix = "") {
  const el = document.getElementById(id);
  const duration = 800;
  const start = performance.now();
  const from = 0;

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + (target - from) * eased);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Slots Table ──
function renderSlotsTable(slots, filter = "all") {
  const tbody = $("#slotsTableBody");
  const isVideoMode = !!videoTimeline;

  // Header tabel: Sembunyikan "Posisi" jika video (sesuai request sebelumnya "tidak dengan lokasinya")
  if (isVideoMode) {
    $("#slotsTable thead").innerHTML = `<tr><th>ID</th><th>Status</th><th>Label</th><th>Confidence</th></tr>`;
  } else {
    $("#slotsTable thead").innerHTML = `<tr><th>ID</th><th>Status</th><th>Label</th><th>Confidence</th><th>Posisi</th></tr>`;
  }
  
  $(".slot-filter").style.display = "flex";

  const filtered = filter === "all" ? slots : slots.filter((s) => s.status === filter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:32px;">Tidak ada data slot.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered
    .map((slot) => {
      const statusClass = slot.status === "occupied" ? "occupied" : "empty";
      const statusLabel = slot.status === "occupied" ? "Terisi" : "Kosong";
      const conf = Math.round(slot.confidence * 100);
      const bbox = slot.bbox;
      return `
      <tr>
        <td><strong>#${slot.slot_id}</strong></td>
        <td><span class="status-badge ${statusClass}">
          <span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>
          ${statusLabel}
        </span></td>
        <td>${slot.label}</td>
        <td>
          <div class="confidence-bar-wrap">
            <div class="confidence-bar"><div class="confidence-bar-inner" style="width:${conf}%"></div></div>
            <span class="confidence-val">${conf}%</span>
          </div>
        </td>
        ${isVideoMode ? '' : `<td><span class="bbox-text">(${bbox.x1}, ${bbox.y1}) → (${bbox.x2}, ${bbox.y2})</span></td>`}
      </tr>`;
    })
    .join("");
}

// ── Filters ──
function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderSlotsTable(slotsData, btn.dataset.filter);
    });
  });
}

// ── Toast Notifications ──
function showToast(message, type = "info") {
  const icons = {
    success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  };

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Lightbox (zoom gambar hasil) ──
function setupLightbox() {
  const lightbox = $("#resultLightbox");
  const lightboxImg = $("#lightboxImage");
  const lightboxVid = $("#lightboxVideo");
  const resultImg = $("#resultImage");
  const resultVid = $("#resultVideo");

  // Klik gambar hasil → buka lightbox
  resultImg.addEventListener("click", () => {
    lightboxImg.src = resultImg.src;
    lightboxImg.style.display = "block";
    lightboxVid.style.display = "none";
    lightbox.classList.add("active");
  });

  resultVid.addEventListener("click", () => {
    lightboxVid.src = resultVid.src;
    lightboxVid.style.display = "block";
    lightboxImg.style.display = "none";
    lightbox.classList.add("active");
  });

  // Klik lightbox → tutup
  lightbox.addEventListener("click", (e) => {
    if(e.target === lightboxVid) return; // Don't close if clicking the video controls
    lightbox.classList.remove("active");
    lightboxVid.pause();
  });

  // Escape → tutup lightbox
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("active")) {
      lightbox.classList.remove("active");
      lightboxVid.pause();
    }
  });
}

// Init lightbox saat DOM ready
document.addEventListener("DOMContentLoaded", () => {
  setupLightbox();
  
  // Realtime Sync Video Timeline
  const resultVid = $("#resultVideo");
  resultVid.addEventListener("timeupdate", () => {
    if (!videoTimeline || videoTimeline.length === 0) return;
    const currentTime = resultVid.currentTime;
    
    // Temukan data timeline terdekat dengan waktu video saat ini
    let currentData = videoTimeline[0];
    for (let i = 0; i < videoTimeline.length; i++) {
      if (videoTimeline[i].time <= currentTime) {
        currentData = videoTimeline[i];
      } else {
        break; // timeline diurutkan dari awal, jadi bisa langsung break
      }
    }
    
    // Jangan update DOM terus menerus jika datanya sama (optimasi render tabel)
    if (currentData && currentData.time !== lastRenderedTime) {
      updateDashboardData(currentData, false); // false = jangan di-animasikan pelan, langsung update
      lastRenderedTime = currentData.time;
    }
  });
});
