const API_BASE = window.location.origin;

let selectedFile = null;
let slotsData = [];
let videoTimeline = null;
let lastRenderedTime = -1;

const $ = (selector) => document.querySelector(selector);

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

document.addEventListener("DOMContentLoaded", () => {
  initScrollReveal();
  initLandingMotion();
  checkApiHealth();
  setupDropZone();
  setupDetectButton();
  setupFilters();
  setupLightbox();
  setupVideoTimelineSync();
});

function initScrollReveal() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const revealItems = document.querySelectorAll(".section-intro, .upload-copy, .section-card");
  const featurePanels = document.querySelectorAll(".feature-panel");

  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    featurePanels.forEach((panel) => panel.classList.add("is-visible"));
    return;
  }

  // Standard reveal for non-card elements
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

  revealItems.forEach((item, index) => {
    item.style.animationDelay = `${Math.min(index * 120, 420)}ms`;
    observer.observe(item);
  });

  // Staggered spring-in for feature panels
  const STAGGER_MS = 140;
  const featureObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      featureObserver.unobserve(entry.target);
      entry.target.classList.add("is-visible");
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });

  featurePanels.forEach((panel, index) => {
    panel.style.setProperty("--stagger-delay", `${index * STAGGER_MS}ms`);
    featureObserver.observe(panel);
  });
}

function initLandingMotion() {
  const hero = $(".hero-section");
  const city = $("#heroCity");
  if (!hero || !city || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    targetX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  });

  hero.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });

  function frame() {
    currentX += (targetX - currentX) * 0.045;
    currentY += (targetY - currentY) * 0.045;
    city.style.transform = `translate3d(${currentX * 10}px, ${currentY * 7}px, 0) rotateX(${currentY * -1.2}deg) rotateY(${currentX * 1.6}deg)`;
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

async function checkApiHealth() {
  const statusDot = $(".status-dot");
  const statusText = $(".status-text");

  try {
    const res = await fetch(`${API_BASE}/api/health`);
    const data = await res.json();
    if (data.status === "success") {
      statusDot.classList.add("online");
      statusDot.classList.remove("offline");
      statusText.textContent = "API Online";
      return;
    }
    statusDot.classList.add("offline");
    statusText.textContent = "API Error";
  } catch {
    statusDot.classList.add("offline");
    statusText.textContent = "API Offline";
  }
}

function setupDropZone() {
  dropZone.addEventListener("click", (event) => {
    if (event.target.closest(".preview-remove")) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", (event) => {
    if (event.target.files.length) handleFile(event.target.files[0]);
  });

  ["dragenter", "dragover"].forEach((name) => {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add("drag-over");
    });
  });

  ["dragleave", "drop"].forEach((name) => {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.remove("drag-over");
    });
  });

  dropZone.addEventListener("drop", (event) => {
    const files = event.dataTransfer.files;
    if (files.length) handleFile(files[0]);
  });

  removePreview.addEventListener("click", (event) => {
    event.stopPropagation();
    clearFile();
  });
}

function handleFile(file) {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "video/mp4",
    "video/avi",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
  ];

  if (!allowedTypes.includes(file.type)) {
    showToast("Format file tidak didukung. Gunakan JPG, PNG, atau Video (MP4/AVI/WEBM).", "error");
    return;
  }

  if (file.size > 100 * 1024 * 1024) {
    showToast("Ukuran file terlalu besar. Maksimal 100MB.", "error");
    return;
  }

  selectedFile = file;
  const fileUrl = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");

  if (isVideo) {
    previewVideo.src = fileUrl;
    previewVideo.style.display = "block";
    previewImage.style.display = "none";
  } else {
    previewImage.src = fileUrl;
    previewImage.style.display = "block";
    previewVideo.style.display = "none";
  }

  previewContainer.style.display = "block";
  dropZoneContent.style.display = "none";
  previewInfo.textContent = `${file.name} - ${formatSize(file.size)}`;
  detectBtn.disabled = false;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  previewContainer.style.display = "none";
  previewImage.style.display = "none";
  previewVideo.style.display = "none";
  previewImage.src = "";
  previewVideo.src = "";
  dropZoneContent.style.display = "flex";
  detectBtn.disabled = true;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function setupDetectButton() {
  detectBtn.addEventListener("click", async () => {
    if (!selectedFile || detectBtn.disabled) return;
    await runDetection();
  });
}

async function runDetection() {
  detectBtn.disabled = true;
  detectBtn.classList.add("loading");
  btnLoader.style.display = "inline-flex";
  loadingOverlay.style.display = "grid";

  const isVideo = selectedFile.type.startsWith("video/");
  $(".loading-subtitle").textContent = isVideo
    ? "AI sedang menganalisis video. Proses ini bisa memakan waktu beberapa saat..."
    : "AI sedang mendeteksi slot parkir dari gambar...";

  const progressBar = $("#loadingProgressBar");
  progressBar.style.width = "0%";
  progressBar.style.transition = "width 0.5s ease";

  let progress = 0;
  const progressInterval = setInterval(() => {
    const increment = isVideo ? Math.random() * 2 : Math.random() * 15;
    if (progress < 90) {
      progress += increment;
      progressBar.style.width = `${Math.min(progress, 90)}%`;
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
      setTimeout(() => displayResults(json.data), 300);
      showToast("Deteksi parkiran berhasil.", "success");
    } else {
      clearInterval(progressInterval);
      showToast(json.message || "Terjadi kesalahan pada deteksi.", "error");
    }
  } catch (error) {
    clearInterval(progressInterval);
    showToast(`Gagal terhubung ke server: ${error.message}`, "error");
  } finally {
    setTimeout(() => {
      detectBtn.disabled = false;
      detectBtn.classList.remove("loading");
      btnLoader.style.display = "none";
      loadingOverlay.style.display = "none";
      progressBar.style.width = "0%";
    }, 400);
  }
}

function displayResults(data) {
  resultsSection.style.display = "grid";

  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);

  updateDashboardData(data, true);
  revealStatCards();

  if (!data.result_image) return;

  const resultImg = $("#resultImage");
  const resultVid = $("#resultVideo");

  if (data.is_video) {
    resultVid.src = API_BASE + data.result_image;
    resultVid.style.display = "block";
    resultImg.style.display = "none";
    videoTimeline = data.timeline || null;
    lastRenderedTime = -1;
  } else {
    resultImg.src = API_BASE + data.result_image;
    resultImg.style.display = "block";
    resultVid.style.display = "none";
    videoTimeline = null;
  }

  $(".slots-card").style.display = "block";
  $(".result-image-card").style.display = "block";
}

function updateDashboardData(data, animate = false) {
  slotsData = data.slots || [];

  if (animate) {
    animateValue("statTotal", data.total_slots || 0);
    animateValue("statEmpty", data.empty || 0);
    animateValue("statOccupied", data.occupied || 0);
    animateValue("statRate", data.occupancy_rate || 0, "%");
  } else {
    $("#statTotal").textContent = data.total_slots || 0;
    $("#statEmpty").textContent = data.empty || 0;
    $("#statOccupied").textContent = data.occupied || 0;
    $("#statRate").textContent = `${data.occupancy_rate || 0}%`;
  }

  const rate = data.occupancy_rate || 0;
  $("#occupancyPercent").textContent = `${rate}%`;
  $("#occupancyBarFill").style.width = animate ? "0%" : `${rate}%`;
  if (animate) {
    setTimeout(() => {
      $("#occupancyBarFill").style.width = `${rate}%`;
    }, 200);
  }

  $("#legendEmpty").textContent = data.empty || 0;
  $("#legendOccupied").textContent = data.occupied || 0;

  const activeFilter = $(".filter-btn.active");
  renderSlotsTable(slotsData, activeFilter ? activeFilter.dataset.filter : "all");
}

function animateValue(id, target, suffix = "") {
  const el = document.getElementById(id);
  const duration = 800;
  const start = performance.now();
  const numericTarget = Number(target) || 0;

  function update(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = `${Math.round(numericTarget * eased)}${suffix}`;
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function renderSlotsTable(slots, filter = "all") {
  const tbody = $("#slotsTableBody");
  const isVideoMode = !!videoTimeline;
  const colSpan = isVideoMode ? 4 : 5;

  $("#slotsTable thead").innerHTML = isVideoMode
    ? "<tr><th>ID</th><th>Status</th><th>Label</th><th>Confidence</th></tr>"
    : "<tr><th>ID</th><th>Status</th><th>Label</th><th>Confidence</th><th>Posisi</th></tr>";

  $(".slot-filter").style.display = "flex";

  const filtered = filter === "all" ? slots : slots.filter((slot) => slot.status === filter);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-table-state">Tidak ada data slot untuk filter ini.</div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((slot, index) => {
    const statusClass = slot.status === "occupied" ? "occupied" : "empty";
    const statusLabel = slot.status === "occupied" ? "Terisi" : "Kosong";
    const conf = Math.round((slot.confidence || 0) * 100);
    const bbox = slot.bbox || {};
    const confidenceTone = conf >= 80 ? "high" : conf >= 55 ? "medium" : "low";
    const label = slot.label || "-";
    const staggerDelay = Math.min(index * 60, 600);
    const positionCell = isVideoMode
      ? ""
      : `<td>
          <div class="bbox-chip">
            <span>${bbox.x1 ?? "-"}, ${bbox.y1 ?? "-"}</span>
            <span class="bbox-arrow">to</span>
            <span>${bbox.x2 ?? "-"}, ${bbox.y2 ?? "-"}</span>
          </div>
        </td>`;

    return `
      <tr class="slot-row ${statusClass}" style="--stagger-delay: ${staggerDelay}ms">
        <td>
          <span class="slot-id-pill">#${slot.slot_id}</span>
        </td>
        <td><span class="status-badge ${statusClass}">
          <span class="status-pulse"></span>
          ${statusLabel}
        </span></td>
        <td><span class="model-label">${label}</span></td>
        <td>
          <div class="confidence-bar-wrap ${confidenceTone}">
            <div class="confidence-bar">
              <div class="confidence-bar-inner" style="width:${conf}%"></div>
            </div>
            <span class="confidence-val">${conf}%</span>
          </div>
        </td>
        ${positionCell}
      </tr>`;
  }).join("");
}

function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      renderSlotsTable(slotsData, btn.dataset.filter);
    });
  });
}

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

function setupLightbox() {
  const lightbox = $("#resultLightbox");
  const lightboxImg = $("#lightboxImage");
  const lightboxVid = $("#lightboxVideo");
  const resultImg = $("#resultImage");
  const resultVid = $("#resultVideo");

  resultImg.addEventListener("click", () => {
    if (!resultImg.src) return;
    lightboxImg.src = resultImg.src;
    lightboxImg.style.display = "block";
    lightboxVid.style.display = "none";
    lightbox.classList.add("active");
  });

  resultVid.addEventListener("click", () => {
    if (!resultVid.src) return;
    lightboxVid.src = resultVid.src;
    lightboxVid.style.display = "block";
    lightboxImg.style.display = "none";
    lightbox.classList.add("active");
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightboxVid) return;
    lightbox.classList.remove("active");
    lightboxVid.pause();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("active")) {
      lightbox.classList.remove("active");
      lightboxVid.pause();
    }
  });
}

function revealStatCards() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const statCards = document.querySelectorAll(".stat-card");
  const STAGGER_MS = 120;

  if (reduceMotion || !("IntersectionObserver" in window)) {
    statCards.forEach((card) => {
      card.classList.add("is-revealed");
      card.style.opacity = "1";
      card.style.transform = "none";
    });
    return;
  }

  statCards.forEach((card) => {
    card.classList.remove("is-revealed");
  });

  const statObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      statObserver.unobserve(entry.target);
      entry.target.classList.add("is-revealed");
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -4% 0px" });

  statCards.forEach((card, index) => {
    card.style.setProperty("--stagger-delay", `${index * STAGGER_MS}ms`);
    statObserver.observe(card);
  });
}

function setupVideoTimelineSync() {
  const resultVid = $("#resultVideo");

  resultVid.addEventListener("timeupdate", () => {
    if (!videoTimeline || videoTimeline.length === 0) return;

    const currentTime = resultVid.currentTime;
    let currentData = videoTimeline[0];

    for (let i = 0; i < videoTimeline.length; i += 1) {
      if (videoTimeline[i].time <= currentTime) {
        currentData = videoTimeline[i];
      } else {
        break;
      }
    }

    if (currentData && currentData.time !== lastRenderedTime) {
      updateDashboardData(currentData, false);
      lastRenderedTime = currentData.time;
    }
  });
}
