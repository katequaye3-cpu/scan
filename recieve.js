// receive.js
"use strict";

// 1) Cache DOM elements
const cameraBtn      = document.getElementById("camera");
const videoContainer = document.getElementById("vid");
const flashEl        = document.getElementById("scan-flash");
const popupEl        = document.getElementById("scan-popup");
const iconEl         = document.getElementById("scan-icon");
const scanTextEl     = document.getElementById("scan-text");
const closeBtn       = document.getElementById("scan-close");
const mainTextEl     = document.getElementById("maintext");
const secTextEl      = document.getElementById("sectext");

// 2) State
let videoEl      = null;
let cameraStream = null;
let rafId        = null;
let scanning     = false;

// 3) Full-screen flash
function doFlash(ok) {
  flashEl.className = ok ? "green" : "red";
  setTimeout(() => flashEl.className = "", 400);
}

// 4) Popup
function showScanPopup(ok, message) {
  popupEl.className = `show ${ok ? "success" : "error"}`;

  scanTextEl.textContent = message;
}

// 5) QR handler
async function handleQRCode(encryptedData) {
  if (scanning) return;
  scanning = true;

  // indicate processing
  mainTextEl.textContent = "Processing…";
  secTextEl.textContent  = "";

  try {
    const bytes = CryptoJS.AES.decrypt(encryptedData, "Made_By_BM");
    const data  = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

    const path      = `${data.name}'s ticket ID ${data.key.slice(-6)}`;
    const unusedRef = ref(db, `Unused/${path}`);
    const snap      = await get(unusedRef);

    if (snap.exists()) {
      await set(ref(db, `Used/${path}`), snap.val());
      await remove(unusedRef);

      doFlash(true);
      showScanPopup(true, "Ticket Approved");

      // update panel texts
      mainTextEl.textContent = data.key;
      secTextEl.innerHTML    =
        `Name: ${data.name}<br>` +
        `Number: ${data.number}<br>` +
        `Email: ${data.email}`;
    } else {
      doFlash(false);
      showScanPopup(false, "Ticket Invalid or Used");

      mainTextEl.textContent = "";
      secTextEl.textContent  = "";
    }
  } catch (err) {
    console.error("Scan/decrypt error:", err);
    doFlash(false);
    showScanPopup(false, "Scan Error");

    mainTextEl.textContent = "";
    secTextEl.textContent  = "";
  } finally {
    stopCamera();
  }
}

// 6) Start camera & scan
async function startCamera() {
  if (videoEl) return;

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });

    videoEl = document.createElement("video");
    videoEl.setAttribute("playsinline", true);
    videoEl.srcObject = cameraStream;
    await videoEl.play();

    videoContainer.innerHTML = "";
    videoContainer.appendChild(videoEl);

    mainTextEl.textContent = "Scanning…";
    secTextEl.textContent  = "";

    scanLoop();
  } catch (err) {
    console.error("Camera start failed:", err);
    doFlash(false);
    showScanPopup(false, "Cannot access camera");
  }
}

// 7) Stop camera & loop
function stopCamera() {
  if (videoEl) {
    videoEl.pause();
    videoContainer.removeChild(videoEl);
    videoEl = null;
  }
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  scanning = false;
}

// 8) Frame-by-frame scan
function scanLoop() {
  if (!videoEl) return;
  const canvas = document.createElement("canvas");
  const ctx    = canvas.getContext("2d");

  (function tick() {
    if (!videoEl) return;
    if (videoEl.readyState === videoEl.HAVE_ENOUGH_DATA) {
      canvas.width  = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code      = jsQR(imageData.data, canvas.width, canvas.height);
      if (code?.data) {
        return handleQRCode(code.data);
      }
    }
    rafId = requestAnimationFrame(tick);
  })();
}

// 9) Event wiring
cameraBtn.addEventListener("click", startCamera);
closeBtn.addEventListener("click", () => {
  popupEl.className = "";
  scanning = false;
});
