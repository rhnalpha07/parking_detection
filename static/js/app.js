/**
 * ParkVision — Application Logic
 * Handles: GSAP animations, file upload, detection API, results display
 */

const API_BASE = window.location.origin;

let selectedFile = null;
let slotsData = [];
let videoTimeline = null;
let lastRenderedTime = -1;

const $ = function (sel) { return document.querySelector(sel); };

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

document.addEventListener("DOMContentLoaded", function () {
  initGSAP();
  checkApiHealth();
  setupDropZone();
  setupDetectButton();
  setupFilters();
  setupLightbox();
  setupVideoTimelineSync();
});

/* ═══════════════════════════════════════
   GSAP Animations
   Per skill: use ScrollTrigger, staggered reveals,
   custom cubic-bezier, transform+opacity only
   ═══════════════════════════════════════ */
function initGSAP() {
  if (typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  // Hero 3D canvas fade on scroll
  gsap.to("#hero3dCanvas", {
    opacity: 0.15,
    ease: "none",
    scrollTrigger: {
      trigger: "#heroSection",
      start: "top top",
      end: "bottom top",
      scrub: 1.5,
    },
  });

  // Hero elements — staggered fade up
  gsap.from(".gsap-hero-el", {
    y: 60,
    opacity: 0,
    duration: 1.2,
    ease: "cubic-bezier(0.32, 0.72, 0, 1)",
    stagger: 0.12,
    delay: 0.3,
  });



  // Section reveals — staggered
  gsap.utils.toArray(".gsap-reveal").forEach(function (el) {
    gsap.from(el, {
      y: 80,
      opacity: 0,
      duration: 1,
      ease: "cubic-bezier(0.32, 0.72, 0, 1)",
      scrollTrigger: {
        trigger: el,
        start: "top 88%",
        toggleActions: "play none none reverse",
      },
    });
  });

  // Pinned Upload Section
  if (window.innerWidth >= 768) {
    ScrollTrigger.create({
      trigger: "#uploadPanel",
      start: "top top",
      end: "bottom bottom",
      pin: ".gsap-pin-section",
      pinSpacing: false,
    });
  }

  // Upload right column — fade in
  gsap.from(".gsap-upload-right", {
    y: 100,
    opacity: 0,
    duration: 1,
    ease: "cubic-bezier(0.32, 0.72, 0, 1)",
    scrollTrigger: {
      trigger: ".gsap-upload-right",
      start: "top 85%",
      toggleActions: "play none none reverse",
    },
  });

  // Navbar shrink on scroll
  ScrollTrigger.create({
    start: "100px top",
    onEnter: function () {
      var nav = $("#mainNav");
      if (nav) {
        nav.style.background = "rgba(10,10,10,0.85)";
        nav.style.borderColor = "rgba(255,255,255,0.08)";
      }
    },
    onLeaveBack: function () {
      var nav = $("#mainNav");
      if (nav) {
        nav.style.background = "rgba(10,10,10,0.6)";
        nav.style.borderColor = "rgba(255,255,255,0.05)";
      }
    },
  });
}

/* ═══════════════════════════════════════
   API Health Check
   ═══════════════════════════════════════ */
async function checkApiHealth() {
  try {
    await fetch(API_BASE + "/api/health");
  } catch (error) {
    showToast("API offline atau bermasalah.", "error");
  }
}

/* ═══════════════════════════════════════
   Drop Zone
   ═══════════════════════════════════════ */
function setupDropZone() {
  dropZone.addEventListener("click", function (e) {
    if (e.target.closest("#removePreview")) return;
    fileInput.click();
  });

  fileInput.addEventListener("change", function (e) {
    if (e.target.files.length) handleFile(e.target.files[0]);
  });

  ["dragenter", "dragover"].forEach(function (name) {
    dropZone.addEventListener(name, function (e) {
      e.preventDefault();
      dropZone.style.borderColor = "rgba(0, 229, 255, 0.5)";
      dropZone.style.background = "rgba(0, 229, 255, 0.03)";
    });
  });

  ["dragleave", "drop"].forEach(function (name) {
    dropZone.addEventListener(name, function (e) {
      e.preventDefault();
      dropZone.style.borderColor = "";
      dropZone.style.background = "";
    });
  });

  dropZone.addEventListener("drop", function (e) {
    var files = e.dataTransfer.files;
    if (files.length) handleFile(files[0]);
  });

  removePreview.addEventListener("click", function (e) {
    e.stopPropagation();
    clearFile();
  });
}

function handleFile(file) {
  var allowedTypes = [
    "image/jpeg", "image/jpg", "image/png",
    "video/mp4", "video/avi", "video/quicktime", "video/x-msvideo", "video/webm",
  ];

  if (!allowedTypes.includes(file.type)) {
    showToast("Format file tidak didukung. Gunakan JPG, PNG, atau Video.", "error");
    return;
  }

  if (file.size > 100 * 1024 * 1024) {
    showToast("Ukuran file terlalu besar. Maksimal 100MB.", "error");
    return;
  }

  selectedFile = file;
  var fileUrl = URL.createObjectURL(file);
  var isVideo = file.type.startsWith("video/");

  if (isVideo) {
    previewVideo.src = fileUrl;
    previewVideo.classList.remove("hidden");
    previewImage.classList.add("hidden");
  } else {
    previewImage.src = fileUrl;
    previewImage.classList.remove("hidden");
    previewVideo.classList.add("hidden");
  }

  previewContainer.classList.remove("hidden");
  previewContainer.classList.add("flex");
  dropZoneContent.classList.add("opacity-0");

  setTimeout(function () { dropZoneContent.classList.add("hidden"); }, 300);

  previewInfo.textContent = file.name + " — " + formatSize(file.size);
  detectBtn.disabled = false;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  previewContainer.classList.add("hidden");
  previewContainer.classList.remove("flex");
  previewImage.classList.add("hidden");
  previewVideo.classList.add("hidden");
  previewImage.src = "";
  previewVideo.src = "";

  dropZoneContent.classList.remove("hidden");
  setTimeout(function () { dropZoneContent.classList.remove("opacity-0"); }, 10);

  detectBtn.disabled = true;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

/* ═══════════════════════════════════════
   Detection
   ═══════════════════════════════════════ */
function setupDetectButton() {
  detectBtn.addEventListener("click", async function () {
    if (!selectedFile || detectBtn.disabled) return;
    await runDetection();
  });
}

async function runDetection() {
  detectBtn.disabled = true;
  btnLoader.classList.remove("hidden");
  loadingOverlay.classList.remove("hidden");
  loadingOverlay.classList.add("flex");

  var isVideo = selectedFile.type.startsWith("video/");
  var progressBar = $("#loadingProgressBar");
  progressBar.style.width = "0%";

  var progress = 0;
  var progressInterval = setInterval(function () {
    var increment = isVideo ? Math.random() * 2 : Math.random() * 15;
    if (progress < 90) {
      progress += increment;
      progressBar.style.width = Math.min(progress, 90) + "%";
    }
  }, 500);

  var formData = new FormData();
  formData.append("image", selectedFile);
  formData.append("save_result", "true");

  try {
    var res = await fetch(API_BASE + "/api/detect", {
      method: "POST",
      body: formData,
    });
    var json = await res.json();

    if (json.status === "success") {
      clearInterval(progressInterval);
      progressBar.style.width = "100%";
      setTimeout(function () { displayResults(json.data); }, 300);
      showToast("Deteksi parkiran berhasil.", "success");
    } else {
      clearInterval(progressInterval);
      showToast(json.message || "Terjadi kesalahan pada deteksi.", "error");
    }
  } catch (error) {
    clearInterval(progressInterval);
    showToast("Gagal terhubung ke server: " + error.message, "error");
  } finally {
    setTimeout(function () {
      detectBtn.disabled = false;
      btnLoader.classList.add("hidden");
      loadingOverlay.classList.add("hidden");
      loadingOverlay.classList.remove("flex");
      progressBar.style.width = "0%";
    }, 400);
  }
}

/* ═══════════════════════════════════════
   Results Display
   ═══════════════════════════════════════ */
function displayResults(data) {
  resultsSection.classList.remove("hidden");

  setTimeout(function () {
    resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);

  updateDashboardData(data, true);

  if (!data.result_image) return;

  var resultImg = $("#resultImage");
  var resultVid = $("#resultVideo");

  if (data.is_video) {
    resultVid.src = API_BASE + data.result_image;
    resultVid.classList.remove("hidden");
    resultImg.classList.add("hidden");
    videoTimeline = data.timeline || null;
    lastRenderedTime = -1;
  } else {
    resultImg.src = API_BASE + data.result_image;
    resultImg.classList.remove("hidden");
    resultVid.classList.add("hidden");
    videoTimeline = null;
  }

  if (typeof ScrollTrigger !== "undefined") {
    ScrollTrigger.refresh();
  }
}

function updateDashboardData(data, animate) {
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
    $("#statRate").textContent = (data.occupancy_rate || 0) + "%";
  }

  var rate = data.occupancy_rate || 0;
  $("#occupancyPercent").textContent = rate + "%";
  $("#occupancyBarFill").style.width = animate ? "0%" : rate + "%";
  if (animate) {
    setTimeout(function () {
      $("#occupancyBarFill").style.width = rate + "%";
    }, 200);
  }

  var activeFilter = $(".filter-btn.active");
  renderSlotsTable(slotsData, activeFilter ? activeFilter.dataset.filter : "all");
}

function animateValue(id, target, suffix) {
  suffix = suffix || "";
  var el = document.getElementById(id);
  var duration = 800;
  var start = performance.now();
  var numericTarget = Number(target) || 0;

  function update(now) {
    var progress = Math.min((now - start) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(numericTarget * eased) + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

function renderSlotsTable(slots, filter) {
  filter = filter || "all";
  var tbody = $("#slotsTableBody");
  var isVideoMode = !!videoTimeline;
  var colSpan = isVideoMode ? 4 : 5;

  var filtered = filter === "all" ? slots : slots.filter(function (s) { return s.status === filter; });

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="' + colSpan + '" class="py-4 text-gray-500 text-sm">Tidak ada data slot untuk filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(function (slot) {
    var isOccupied = slot.status === "occupied";
    var statusLabel = isOccupied ? "Terisi" : "Kosong";
    var conf = Math.round((slot.confidence || 0) * 100);
    var bbox = slot.bbox || {};
    var label = slot.label || "-";
    var positionCell = isVideoMode
      ? ""
      : '<td class="py-3"><span class="bg-dark px-2 py-1 rounded text-xs font-mono border border-white/5">' + (bbox.x1 != null ? bbox.x1 : "-") + ", " + (bbox.y1 != null ? bbox.y1 : "-") + " to " + (bbox.x2 != null ? bbox.x2 : "-") + ", " + (bbox.y2 != null ? bbox.y2 : "-") + "</span></td>";

    return '<tr class="border-b border-white/5 hover:bg-white/3 transition-colors">' +
      '<td class="py-3 font-bold font-mono text-xs">#' + slot.slot_id + '</td>' +
      '<td class="py-3"><span class="px-2.5 py-1 rounded-full text-xs font-bold ' + (isOccupied ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400") + '">' + statusLabel + '</span></td>' +
      '<td class="py-3 text-gray-400 text-xs">' + label + '</td>' +
      '<td class="py-3"><div class="flex items-center gap-2"><div class="w-20 h-1.5 bg-dark rounded-full overflow-hidden"><div class="h-full bg-white/60 rounded-full" style="width:' + conf + '%"></div></div><span class="text-xs font-mono text-gray-400">' + conf + '%</span></div></td>' +
      positionCell +
      '</tr>';
  }).join("");
}

/* ═══════════════════════════════════════
   Filters
   ═══════════════════════════════════════ */
function setupFilters() {
  document.querySelectorAll(".filter-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".filter-btn").forEach(function (item) {
        item.classList.remove("active");
        item.style.background = "";
        item.style.color = "";
      });
      btn.classList.add("active");
      renderSlotsTable(slotsData, btn.dataset.filter);
    });
  });
}

/* ═══════════════════════════════════════
   Toast
   ═══════════════════════════════════════ */
function showToast(message, type) {
  type = type || "info";
  var toast = document.createElement("div");
  var colorClass = type === "success" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" :
                   type === "error" ? "bg-rose-500/15 text-rose-400 border-rose-500/30" :
                   "bg-white/8 text-white border-white/15";

  toast.className = "toast px-4 py-3 rounded-xl border backdrop-blur-md font-semibold text-sm " + colorClass;
  toast.innerHTML = message;
  toastContainer.appendChild(toast);

  setTimeout(function () {
    toast.classList.add("hiding");
    setTimeout(function () { toast.remove(); }, 300);
  }, 4000);
}

/* ═══════════════════════════════════════
   Lightbox
   ═══════════════════════════════════════ */
function setupLightbox() {
  var lightbox = $("#resultLightbox");
  var lightboxImg = $("#lightboxImage");
  var lightboxVid = $("#lightboxVideo");
  var resultImgWrapper = $("#resultImageWrapper");

  resultImgWrapper.addEventListener("click", function () {
    var rImg = $("#resultImage");
    var rVid = $("#resultVideo");

    if (!rImg.classList.contains("hidden") && rImg.src) {
      lightboxImg.src = rImg.src;
      lightboxImg.classList.remove("hidden");
      lightboxVid.classList.add("hidden");
      lightbox.classList.remove("hidden");
      lightbox.classList.add("flex");
    } else if (!rVid.classList.contains("hidden") && rVid.src) {
      lightboxVid.src = rVid.src;
      lightboxVid.classList.remove("hidden");
      lightboxImg.classList.add("hidden");
      lightbox.classList.remove("hidden");
      lightbox.classList.add("flex");
    }
  });

  lightbox.addEventListener("click", function (e) {
    if (e.target === lightboxVid) return;
    lightbox.classList.add("hidden");
    lightbox.classList.remove("flex");
    lightboxVid.pause();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !lightbox.classList.contains("hidden")) {
      lightbox.classList.add("hidden");
      lightbox.classList.remove("flex");
      lightboxVid.pause();
    }
  });
}

/* ═══════════════════════════════════════
   Video Timeline Sync
   ═══════════════════════════════════════ */
function setupVideoTimelineSync() {
  var resultVid = $("#resultVideo");

  resultVid.addEventListener("timeupdate", function () {
    if (!videoTimeline || videoTimeline.length === 0) return;

    var currentTime = resultVid.currentTime;
    var currentData = videoTimeline[0];

    for (var i = 0; i < videoTimeline.length; i++) {
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
