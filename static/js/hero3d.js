/**
 * ParkVision Hero 3D — Three.js Parking Lot Scene
 * Immersive 3D parking lot with animated vehicles,
 * glowing slot outlines, scanning beams, and particle effects.
 * Uses THREE global from jsdelivr CDN.
 */
(function () {
  "use strict";

  // Guard: ensure THREE is loaded
  if (typeof THREE === "undefined") {
    console.warn("[hero3d] THREE.js not loaded, skipping 3D hero.");
    return;
  }

  const CANVAS_ID = "hero3dCanvas";

  const COL = {
    ground: 0x0c0c0c,
    lineEmpty: 0x22dd77,
    lineOccupied: 0xff4466,
    car: 0x1a1a2e,
    carAccent: 0x00e5ff,
    scanBeam: 0x00e5ff,
    particle: 0x00e5ff,
    ambient: 0x1a2530,
    fog: 0x0a0a0a,
  };

  let scene, camera, renderer, clock;
  let cars = [];
  let slots = [];
  let scanBeam;
  let particles;
  let animId;
  let mouseX = 0, mouseY = 0;
  let targetCamX = 0, targetCamY = 0;

  function init() {
    const canvas = document.getElementById(CANVAS_ID);
    if (!canvas) {
      console.warn("[hero3d] Canvas element not found.");
      return;
    }

    clock = new THREE.Clock();

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(COL.fog, 0.015);

    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;

    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    camera.position.set(0, 28, 32);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;

    // Lights — boosted for visibility
    scene.add(new THREE.AmbientLight(COL.ambient, 1.4));

    var dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
    dirLight.position.set(15, 25, 10);
    scene.add(dirLight);

    var pointLight = new THREE.PointLight(COL.scanBeam, 2.5, 80);
    pointLight.position.set(0, 15, 0);
    scene.add(pointLight);

    // Build
    createGround();
    createGridHelper();
    createParkingSlots();
    createCars();
    createScanBeam();
    createParticles();

    // Events
    window.addEventListener("resize", onResize);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("touchmove", onTouchMove, { passive: true });

    animate();
  }

  function createGround() {
    const geo = new THREE.PlaneGeometry(80, 80);
    const mat = new THREE.MeshStandardMaterial({
      color: COL.ground,
      roughness: 0.95,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.01;
    scene.add(mesh);
  }

  function createGridHelper() {
    const grid = new THREE.GridHelper(60, 60, 0x111120, 0x111120);
    grid.position.y = 0.01;
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    scene.add(grid);
  }

  function createParkingSlots() {
    const slotW = 3.2;
    const slotD = 5.5;
    const rows = 4;
    const cols = 6;
    const gapX = 0.8;
    const gapZ = 1.2;
    const startX = -((cols * (slotW + gapX)) / 2) + slotW / 2;
    const startZ = -((rows * (slotD + gapZ)) / 2) + slotD / 2;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = startX + c * (slotW + gapX);
        const z = startZ + r * (slotD + gapZ);
        const occupied = Math.random() > 0.4;
        const color = occupied ? COL.lineOccupied : COL.lineEmpty;

        // Slot outline
        const pts = [
          new THREE.Vector3(-slotW / 2, 0.02, -slotD / 2),
          new THREE.Vector3(slotW / 2, 0.02, -slotD / 2),
          new THREE.Vector3(slotW / 2, 0.02, slotD / 2),
          new THREE.Vector3(-slotW / 2, 0.02, slotD / 2),
          new THREE.Vector3(-slotW / 2, 0.02, -slotD / 2),
        ];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
        var lineMat = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.95 });
        const line = new THREE.Line(lineGeo, lineMat);
        line.position.set(x, 0, z);
        scene.add(line);

        // Glow
        const glowGeo = new THREE.PlaneGeometry(slotW - 0.4, slotD - 0.4);
        var glowMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.12, side: THREE.DoubleSide });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(x, 0.03, z);
        scene.add(glow);

        slots.push({ line, glow, mat: lineMat, glowMat: glowMat, occupied, x, z, baseOpacity: 0.95 });
      }
    }
  }

  function createCars() {
    const occupiedSlots = slots.filter(function (s) { return s.occupied; });

    occupiedSlots.forEach(function (slot) {
      var carGroup = new THREE.Group();

      // Body
      var bodyGeo = new THREE.BoxGeometry(2.4, 0.8, 4.2);
      var bodyMat = new THREE.MeshStandardMaterial({ color: COL.car, roughness: 0.3, metalness: 0.8 });
      var body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      carGroup.add(body);

      // Cabin
      var cabinGeo = new THREE.BoxGeometry(2.0, 0.6, 2.2);
      var cabinMat = new THREE.MeshStandardMaterial({ color: 0x111128, roughness: 0.2, metalness: 0.9 });
      var cabin = new THREE.Mesh(cabinGeo, cabinMat);
      cabin.position.set(0, 1.1, -0.3);
      carGroup.add(cabin);

      // Headlights
      var hlGeo = new THREE.SphereGeometry(0.15, 8, 8);
      var hlMat = new THREE.MeshBasicMaterial({ color: COL.carAccent });
      [-0.8, 0.8].forEach(function (xOff) {
        var hl = new THREE.Mesh(hlGeo, hlMat);
        hl.position.set(xOff, 0.5, -2.2);
        carGroup.add(hl);
      });

      // Accent edge
      var edgeGeo = new THREE.BoxGeometry(2.5, 0.05, 0.05);
      var edgeMat = new THREE.MeshBasicMaterial({ color: COL.carAccent, transparent: true, opacity: 0.8 });
      var edge = new THREE.Mesh(edgeGeo, edgeMat);
      edge.position.set(0, 0.15, -2.15);
      carGroup.add(edge);

      carGroup.position.set(slot.x, 0, slot.z);
      carGroup.rotation.y = (Math.random() - 0.5) * 0.06;
      scene.add(carGroup);
      cars.push(carGroup);
    });
  }

  function createScanBeam() {
    var geo = new THREE.PlaneGeometry(40, 0.12);
    var mat = new THREE.MeshBasicMaterial({ color: COL.scanBeam, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    scanBeam = new THREE.Mesh(geo, mat);
    scanBeam.rotation.x = -Math.PI / 2;
    scanBeam.position.y = 0.05;
    scene.add(scanBeam);

    // Vertical beam
    var vGeo = new THREE.PlaneGeometry(40, 6);
    var vMat = new THREE.MeshBasicMaterial({ color: COL.scanBeam, transparent: true, opacity: 0.025, side: THREE.DoubleSide });
    var vBeam = new THREE.Mesh(vGeo, vMat);
    vBeam.position.y = 3;
    scanBeam.add(vBeam);
  }

  function createParticles() {
    var count = 250;
    var positions = new Float32Array(count * 3);

    for (var i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 60;
      positions[i * 3 + 1] = Math.random() * 18 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }

    var geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    var mat = new THREE.PointsMaterial({
      color: COL.particle,
      size: 0.1,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    });

    particles = new THREE.Points(geo, mat);
    scene.add(particles);
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    var t = clock.getElapsedTime();

    // Camera orbit + mouse parallax
    var orbitSpeed = 0.07;
    var orbitRadius = 35;
    var baseAngle = t * orbitSpeed;

    targetCamX += (mouseX * 3 - targetCamX) * 0.015;
    targetCamY += (mouseY * 1.5 - targetCamY) * 0.015;

    camera.position.x = Math.sin(baseAngle) * orbitRadius + targetCamX;
    camera.position.z = Math.cos(baseAngle) * orbitRadius;
    camera.position.y = 24 + Math.sin(t * 0.25) * 1.5 + targetCamY;
    camera.lookAt(0, 0, 0);

    // Scan beam sweep
    if (scanBeam) {
      scanBeam.position.z = Math.sin(t * 0.4) * 14;
    }

    // Slot pulsing
    for (var i = 0; i < slots.length; i++) {
      var pulse = Math.sin(t * 2 + i * 0.3) * 0.12;
      slots[i].mat.opacity = slots[i].baseOpacity + pulse;
      slots[i].glowMat.opacity = 0.05 + pulse * 0.03;
    }

    // Particles drift
    if (particles) {
      var posArr = particles.geometry.attributes.position.array;
      for (var j = 0; j < posArr.length; j += 3) {
        posArr[j + 1] += Math.sin(t + j) * 0.002;
        posArr[j] += Math.cos(t * 0.4 + j) * 0.0015;
      }
      particles.geometry.attributes.position.needsUpdate = true;
      particles.rotation.y = t * 0.015;
    }

    renderer.render(scene, camera);
  }

  function onResize() {
    var canvas = renderer.domElement;
    var parent = canvas.parentElement;
    if (!parent) return;
    var w = parent.clientWidth;
    var h = parent.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function onMouseMove(e) {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }

  function onTouchMove(e) {
    if (e.touches.length > 0) {
      mouseX = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
      mouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
    }
  }

  // Boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    // Small delay to ensure canvas is laid out
    setTimeout(init, 50);
  }
})();
