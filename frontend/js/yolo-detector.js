// frontend/js/yolo-detector.js

let session = null;
let webcamActive = false;
let currentStream = null;
let currentFacingMode = 'environment';
let inferenceActive = false;

// Dynamic extracted class names from ONNX metadata
let classNames = {};

// Hardcoded fallback classes
// DAFTAR NAMA KELAS (Sudah disesuaikan dengan data.yaml Roboflow)
const NAMA_KELAS = [
  '100',
  '1000',
  '200',
  '500',
  'BAsli_100k',
  'BAsli_10k',
  'BAsli_1k',
  'BAsli_20k',
  'BAsli_2k',
  'BAsli_50k',
  'BAsli_5k',
  'BPalsu_100k',
  'BPalsu_10k',
  'BPalsu_1k',
  'BPalsu_20k',
  'BPalsu_2k',
  'BPalsu_50k',
  'BPalsu_5k',
  'DAsli_100k',
  'DAsli_10k',
  'DAsli_1k',
  'DAsli_20k',
  'DAsli_2k',
  'DAsli_50k',
  'DAsli_5k',
  'DPalsu_100k',
  'DPalsu_10k',
  'DPalsu_1k',
  'DPalsu_20k',
  'DPalsu_2k',
  'DPalsu_50k',
  'DPalsu_5k',
  'Uang Palsu',
  'dua puluh ribu rupiah',
  'dua ribu rupiah',
  'lima puluh ribu rupiah',
  'lima ribu rupiah',
  'sepuluh ribu rupiah',
  'seratus ribu rupiah',
  'seribu rupiah'
];

const offscreenCanvas = document.createElement('canvas');
offscreenCanvas.width = 640;
offscreenCanvas.height = 640;
const offscreenCtx = offscreenCanvas.getContext('2d');

async function initYolo() {
  if (session) return;
  updateModelStatus('loading', 'Memuat Model...');

  try {
    if (typeof ort !== 'undefined') {
      // SETTING OPTIMALISASI WASM: Mengaktifkan Multi-Threading & SIMD
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/';
      ort.env.wasm.numThreads = Math.min(navigator.hardwareConcurrency || 4, 4); // Gunakan maksimal 4 core CPU
      ort.env.wasm.simd = true; // Aktifkan SIMD (Single Instruction Multiple Data) untuk kecepatan kalkulasi 10x lipat

      // Load model using WASM
      session = await ort.InferenceSession.create('/model/best.onnx', {
        executionProviders: ['wasm']
      });

      // Ekstrak nama kelas asli secara dinamis langsung dari metadata file best.onnx
      extractClassNames();
      updateModelStatus('ready', 'Model Siap');
    } else {
      setTimeout(initYolo, 500);
    }
  } catch (err) {
    console.error("Gagal memuat model AI:", err);
    updateModelStatus('missing', 'Model Gagal Dimuat');
  }

  setupControls();
  await populateCameras();
}

function extractClassNames() {
  if (session && session.metaData && session.metaData.names) {
    try {
      const parsed = JSON.parse(session.metaData.names);
      classNames = parsed;
      console.log("Berhasil mengekstrak kelas dinamis dari metadata model ONNX:", classNames);
    } catch (e) {
      console.warn("Gagal mengekstrak nama kelas dari metadata:", e);
    }
  }
}

function getClassName(classId) {
  // Gunakan nama kelas dinamis hasil ekstraksi ONNX jika tersedia
  if (classNames && classNames[classId]) {
    return classNames[classId];
  }
  // Fallback ke list hardcoded jika ekstraksi gagal
  return NAMA_KELAS[classId] || `Nominal ${classId}`;
}

function updateModelStatus(status, text) {
  const badge = document.getElementById('model-status-badge');
  if (!badge) return;

  badge.innerText = text;
  badge.className = 'badge'; // Reset classes

  if (status === 'ready') {
    badge.classList.add('badge-success');
  } else if (status === 'loading') {
    badge.classList.add('badge-primary');
  } else {
    badge.classList.add('badge-warning');
  }
}

async function populateCameras() {
  const select = document.getElementById('camera-select');
  if (!select) return;

  try {
    await navigator.mediaDevices.getUserMedia({ video: true })
      .then(s => s.getTracks().forEach(t => t.stop()))
      .catch(() => { });

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');

    select.innerHTML = '';
    if (videoDevices.length === 0) {
      select.innerHTML = '<option>Kamera tidak ditemukan</option>';
      return;
    }

    videoDevices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Kamera ${index + 1}`;
      select.appendChild(option);
    });
  } catch (err) {
    console.error("Gagal mendata kamera");
  }
}

function setupControls() {
  const btnStart = document.getElementById('btn-start-camera');
  const btnStop = document.getElementById('btn-stop-camera');
  const camSelect = document.getElementById('camera-select');

  if (btnStart) btnStart.onclick = startCamera;
  if (btnStop) btnStop.onclick = stopCamera;
  if (camSelect) {
    camSelect.onchange = () => {
      if (webcamActive) startCamera();
    };
  }
}

async function startCamera() {
  const select = document.getElementById('camera-select');
  const deviceId = select ? select.value : null;
  const constraints = {
    video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: currentFacingMode }
  };

  const btnStart = document.getElementById('btn-start-camera');
  if (btnStart) {
    btnStart.innerText = 'Mengakses Kamera...';
    btnStart.disabled = true;
  }

  try {
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }

    currentStream = await navigator.mediaDevices.getUserMedia(constraints);

    const video = document.getElementById('webcam-video');
    video.srcObject = currentStream;

    await new Promise((resolve) => {
      video.onloadedmetadata = resolve;
    });
    video.play();

    const canvas = document.getElementById('detector-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.latestDetections = []; // Reset detections

    document.getElementById('camera-placeholder').style.display = 'none';
    document.getElementById('btn-stop-camera').disabled = false;

    webcamActive = true;

    // Aktifkan kedua loop secara terpisah
    requestAnimationFrame(renderLoop);
    setTimeout(aiLoop, 200); // Mulai Loop AI 200ms kemudian agar rendering stabil
  } catch (err) {
    console.error("Gagal mengakses kamera:", err);
    document.getElementById('camera-placeholder').style.display = 'flex';
    document.getElementById('btn-stop-camera').disabled = true;
  } finally {
    if (btnStart) {
      btnStart.innerText = 'Nyalakan Kamera';
      btnStart.disabled = false;
    }
  }
}

function stopCamera() {
  webcamActive = false;
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }

  const video = document.getElementById('webcam-video');
  if (video) {
    video.pause();
    video.srcObject = null;
  }

  const canvas = document.getElementById('detector-canvas');
  if (canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  document.getElementById('camera-placeholder').style.display = 'flex';
  document.getElementById('btn-stop-camera').disabled = true;
}

// LOOP 1: Render Loop (Silky smooth 60 FPS untuk rendering video feed kamera)
function renderLoop() {
  if (!webcamActive) return;

  const video = document.getElementById('webcam-video');
  const canvas = document.getElementById('detector-canvas');
  if (!video || !canvas || video.paused || video.ended) {
    if (webcamActive) requestAnimationFrame(renderLoop);
    return;
  }

  const ctx = canvas.getContext('2d');

  // 1. Draw webcam frame onto canvas (Super Ringan!)
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // 2. Draw active bounding boxes (Dari data AI hasil background thread)
  let fakeMoneyDetected = false;
  if (canvas.latestDetections && canvas.latestDetections.length > 0) {
    const scaleX = canvas.width / 640;
    const scaleY = canvas.height / 640;

    canvas.latestDetections.forEach(box => {
      const x = box.x1 * scaleX;
      const y = box.y1 * scaleY;
      const w = box.w * scaleX;
      const h = box.h * scaleY;

      const labelName = getClassName(box.classId);
      const isPalsu = labelName.toLowerCase().includes('palsu') || labelName.toLowerCase().includes('fake');

      if (isPalsu) fakeMoneyDetected = true;

      const color = isPalsu ? '#ef4444' : '#10b981';

      // Draw border
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Draw label background
      ctx.fillStyle = color;
      const text = `${labelName} (${(box.score * 100).toFixed(0)}%)`;
      ctx.font = 'bold 12px Inter, sans-serif';
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(x - 1, y - 20, textWidth + 10, 20);

      // Draw label text
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 4, y - 5);
    });
  }

  // 3. Play alarm if fake money is detected
  if (fakeMoneyDetected) {
    playAlarmSound();
  }

  if (webcamActive) {
    requestAnimationFrame(renderLoop);
  }
}

// LOOP 2: Throttled AI Loop (Berjalan terpisah secara independen setiap 500ms)
async function aiLoop() {
  if (!webcamActive) return;

  const video = document.getElementById('webcam-video');
  const canvas = document.getElementById('detector-canvas');

  if (session && !inferenceActive && video && video.videoWidth > 0) {
    inferenceActive = true;

    try {
      offscreenCtx.drawImage(video, 0, 0, 640, 640);
      const imgData = offscreenCtx.getImageData(0, 0, 640, 640);

      const inputTensor = preprocess(imgData);

      const results = await session.run({ [session.inputNames[0]]: inputTensor });
      const outputTensor = results[session.outputNames[0]];

      const threshold = 0.40;
      const rawBoxes = postprocess(outputTensor, threshold);
      const finalBoxes = nonMaximumSuppression(rawBoxes, 0.45);

      // Simpan hasil deteksi di elemen canvas untuk digambar oleh Loop 1 secara asinkron
      canvas.latestDetections = finalBoxes;
    } catch (err) {
      console.error("Kesalahan inferensi background:", err);
    } finally {
      inferenceActive = false;
    }
  }

  // Jadwalkan kalkulasi AI berikutnya 500ms lagi (Mengurangi penggunaan CPU hingga 90%!)
  if (webcamActive) {
    setTimeout(aiLoop, 500);
  }
}

function preprocess(imgData) {
  const float32Data = new Float32Array(3 * 640 * 640);
  const totalPixels = 640 * 640;

  for (let i = 0; i < totalPixels; i++) {
    float32Data[i] = imgData.data[i * 4] / 255.0; // R
    float32Data[totalPixels + i] = imgData.data[i * 4 + 1] / 255.0; // G
    float32Data[2 * totalPixels + i] = imgData.data[i * 4 + 2] / 255.0; // B
  }

  return new ort.Tensor('float32', float32Data, [1, 3, 640, 640]);
}

function postprocess(tensor, threshold) {
  const data = tensor.data;
  const dims = tensor.dims;
  const boxes = [];

  // Shape standard: [1, features, boxes]
  if (dims[1] < dims[2]) {
    const featuresCount = dims[1];
    const boxesCount = dims[2];
    const classesCount = featuresCount - 4;

    for (let c = 0; c < boxesCount; c++) {
      let maxScore = -1;
      let classId = -1;

      for (let cl = 0; cl < classesCount; cl++) {
        const score = data[(4 + cl) * boxesCount + c];
        if (score > maxScore) {
          maxScore = score;
          classId = cl;
        }
      }

      if (maxScore > threshold) {
        const cx = data[0 * boxesCount + c];
        const cy = data[1 * boxesCount + c];
        const w = data[2 * boxesCount + c];
        const h = data[3 * boxesCount + c];

        boxes.push({
          x1: cx - w / 2,
          y1: cy - h / 2,
          w: w,
          h: h,
          score: maxScore,
          classId: classId
        });
      }
    }
  }
  // Shape transposed: [1, boxes, features]
  else {
    const boxesCount = dims[1];
    const featuresCount = dims[2];
    const classesCount = featuresCount - 4;

    for (let b = 0; b < boxesCount; b++) {
      const offset = b * featuresCount;
      let maxScore = -1;
      let classId = -1;

      for (let cl = 0; cl < classesCount; cl++) {
        const score = data[offset + 4 + cl];
        if (score > maxScore) {
          maxScore = score;
          classId = cl;
        }
      }

      if (maxScore > threshold) {
        const cx = data[offset + 0];
        const cy = data[offset + 1];
        const w = data[offset + 2];
        const h = data[offset + 3];

        boxes.push({
          x1: cx - w / 2,
          y1: cy - h / 2,
          w: w,
          h: h,
          score: maxScore,
          classId: classId
        });
      }
    }
  }

  return boxes;
}

function calculateIoU(box1, box2) {
  const xA = Math.max(box1.x1, box2.x1);
  const yA = Math.max(box1.y1, box2.y1);
  const xB = Math.min(box1.x1 + box1.w, box2.x1 + box2.w);
  const yB = Math.min(box1.y1 + box1.h, box2.y1 + box2.h);

  const intersectionArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (intersectionArea === 0) return 0;

  const box1Area = box1.w * box1.h;
  const box2Area = box2.w * box2.h;
  const unionArea = box1Area + box2Area - intersectionArea;

  return intersectionArea / unionArea;
}

function nonMaximumSuppression(boxes, iouThreshold = 0.45) {
  boxes.sort((a, b) => b.score - a.score);
  const picked = [];
  const suppressed = new Set();

  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue;

    const box = boxes[i];
    picked.push(box);

    for (let j = i + 1; j < boxes.length; j++) {
      if (suppressed.has(j)) continue;

      const iou = calculateIoU(box, boxes[j]);
      if (iou > iouThreshold) {
        suppressed.add(j);
      }
    }
  }

  return picked;
}

let lastBeepTime = 0;
function playAlarmSound() {
  const now = Date.now();
  if (now - lastBeepTime < 1800) return;
  lastBeepTime = now;

  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.15);

    setTimeout(() => {
      try {
        if (audioCtx.state === 'closed') return;
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.2);
      } catch (e) { }
    }, 180);

  } catch (e) {
    console.error("Audio synth error:", e);
  }
}