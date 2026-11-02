import { useEffect, useRef, useState } from "react";

const EXAM_PRESETS = [
  { id: "upsc-photo", exam: "UPSC", type: "Photo", width: 350, height: 350, maxKB: 100, hint: "Passport photo" },
  { id: "upsc-signature", exam: "UPSC", type: "Signature", width: 350, height: 150, maxKB: 20, hint: "Scanned signature" },
  { id: "ssc-photo", exam: "SSC", type: "Photo", width: 100, height: 120, maxKB: 50, hint: "Candidate photo" },
  { id: "ssc-signature", exam: "SSC", type: "Signature", width: 40, height: 20, maxKB: 20, hint: "Candidate signature" },
  { id: "banking-photo", exam: "Banking", type: "Photo", width: 200, height: 230, maxKB: 50, hint: "IBPS / SBI photo" },
  { id: "banking-signature", exam: "Banking", type: "Signature", width: 140, height: 60, maxKB: 20, hint: "IBPS / SBI signature" },
  { id: "rrb-photo", exam: "RRB", type: "Photo", width: 200, height: 230, maxKB: 40, hint: "Railway exam photo" },
  { id: "rrb-signature", exam: "RRB", type: "Signature", width: 140, height: 60, maxKB: 20, hint: "Railway exam signature" },
];

const GENERAL_PRESETS = [
  { id: "passport-id", exam: "Passport / ID", type: "Portrait", width: 600, height: 600, maxKB: 500, hint: "Square ID photo" },
  { id: "job-profile", exam: "Job application", type: "Portrait", width: 400, height: 500, maxKB: 200, hint: "Profile photo" },
  { id: "portal-upload", exam: "Document portal", type: "Upload", width: 1200, height: 1600, maxKB: 500, hint: "Portrait document image" },
  { id: "web-image", exam: "Web image", type: "General", width: 1600, height: 1200, maxKB: 500, hint: "Website / online form" },
  { id: "email-image", exam: "Email attachment", type: "Compact", width: 1280, height: 960, maxKB: 300, hint: "Smaller attachment" },
];

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 25_000_000;
const MAX_QUEUE_FILES = 10;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function Icon({ name, className = "h-5 w-5" }) {
  const shared = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };
  const paths = {
    sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 .9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9L19 14Z" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16.5v2A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 1 1 8 0v3" /><path d="M12 14v3" /></>,
    download: <><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    crop: <><path d="M6 3v12a3 3 0 0 0 3 3h12" /><path d="M18 21V9a3 3 0 0 0-3-3H3" /></>,
    infinity: <path d="M12 12c-2-2.7-3.5-4-5.5-4a4 4 0 0 0 0 8c2 0 3.5-1.3 5.5-4Zm0 0c2-2.7 3.5-4 5.5-4a4 4 0 0 1 0 8c-2 0-3.5-1.3-5.5-4Z" />,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M16 3h3a2 2 0 0 1 2 2v3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M21 16v3a2 2 0 0 1-2 2h-3" /></>,
  };
  return <svg {...shared}>{paths[name]}</svg>;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function normalizeInput(value) {
  const number = Number(value);
  return Math.min(10000, Math.max(1, Math.round(Number.isFinite(number) ? number : 1)));
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be opened. Try a different JPG, PNG, or WebP file."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Your browser could not encode this image. Please try another file."));
    }, "image/jpeg", quality);
  });
}

async function encodeUnderLimit(canvas, maxBytes) {
  let low = 0.12;
  let high = 0.96;
  let best = null;
  let smallest = null;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const quality = (low + high) / 2;
    const blob = await canvasToBlob(canvas, quality);
    if (!smallest || blob.size < smallest.blob.size) smallest = { blob, quality };
    if (blob.size <= maxBytes && (!best || quality > best.quality)) {
      best = { blob, quality };
      low = quality;
    } else {
      high = quality;
    }
  }

  if (best) return { ...best, meetsLimit: true };
  const lowestQualityBlob = await canvasToBlob(canvas, 0.12);
  const result = lowestQualityBlob.size < smallest.blob.size
    ? { blob: lowestQualityBlob, quality: 0.12 }
    : smallest;
  return { ...result, meetsLimit: false };
}

function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function dataUrlToBlob(dataUrl) {
  const separator = dataUrl.indexOf(",");
  const mimeType = /^data:(image\/[\w.+-]+);base64$/i.exec(dataUrl.slice(0, separator))?.[1];
  if (separator < 0 || !mimeType) {
    throw new Error("The processed image could not be prepared for download. Please process it again.");
  }
  const binary = atob(dataUrl.slice(separator + 1));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

async function resizeImage(file, width, height, maxKB, enhanceSignature) {
  if (width * height > MAX_OUTPUT_PIXELS) {
    throw new Error("The requested output is too large to process safely in this browser. Use dimensions totaling 25 megapixels or fewer.");
  }
  const { image, url } = await loadImage(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: enhanceSignature });
    if (!context) throw new Error("Your browser could not prepare the image for resizing.");

    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const cropWidth = width / scale;
    const cropHeight = height / scale;
    const sourceX = (image.naturalWidth - cropWidth) / 2;
    const sourceY = (image.naturalHeight - cropHeight) / 2;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);

    if (enhanceSignature) {
      const pixels = context.getImageData(0, 0, width, height);
      const data = pixels.data;
      for (let index = 0; index < data.length; index += 4) {
        const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
        const color = luminance < 190 ? 0 : 255;
        data[index] = color;
        data[index + 1] = color;
        data[index + 2] = color;
      }
      context.putImageData(pixels, 0, 0);
    }

    const result = await encodeUnderLimit(canvas, maxKB * 1024);
    let quality = result.quality;
    let dataUrl = canvas.toDataURL("image/jpeg", quality);
    let size = dataUrlByteLength(dataUrl);
    while (size > maxKB * 1024 && quality > 0.12) {
      quality = Math.max(0.12, quality * 0.85);
      dataUrl = canvas.toDataURL("image/jpeg", quality);
      size = dataUrlByteLength(dataUrl);
    }
    return {
      dataUrl,
      size,
      meetsLimit: size <= maxKB * 1024,
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function App() {
  const inputRef = useRef(null);
  const sourceUrlsRef = useRef(new Map());
  const downloadUrlsRef = useRef(new Map());
  const [queue, setQueue] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [width, setWidth] = useState(350);
  const [height, setHeight] = useState(350);
  const [maxKB, setMaxKB] = useState(100);
  const [ratioLocked, setRatioLocked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [activePreset, setActivePreset] = useState("upsc-photo");
  const [presetCategory, setPresetCategory] = useState("exam");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enhanceSignature, setEnhanceSignature] = useState(false);
  const [error, setError] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const shareTimerRef = useRef(null);

  useEffect(() => () => {
    sourceUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    sourceUrlsRef.current.clear();
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrlsRef.current.clear();
    if (shareTimerRef.current) window.clearTimeout(shareTimerRef.current);
  }, []);

  async function copyPageLink() {
    try {
      const currentUrl = window.location.href;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentUrl);
      } else {
        const temporaryInput = document.createElement("textarea");
        temporaryInput.value = currentUrl;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        const copied = document.execCommand("copy");
        temporaryInput.remove();
        if (!copied) throw new Error("Clipboard copy was declined by the browser.");
      }

      setShareStatus("Link copied!");
    } catch (copyError) {
      console.error("Could not copy the page link.", copyError);
      setShareStatus("Copy failed");
    }

    if (shareTimerRef.current) window.clearTimeout(shareTimerRef.current);
    shareTimerRef.current = window.setTimeout(() => setShareStatus(""), 2200);
  }

  function addFiles(fileList) {
    setError("");
    const files = Array.from(fileList || []);
    const validFiles = [];
    const issues = [];

    files.forEach((candidate) => {
      if (!ACCEPTED_TYPES.includes(candidate.type)) {
        issues.push(`${candidate.name}: use JPG, PNG, or WebP.`);
      } else if (candidate.size > MAX_FILE_BYTES) {
        issues.push(`${candidate.name}: larger than the 20 MB limit.`);
      } else {
        validFiles.push(candidate);
      }
    });

    const knownFiles = new Set(queue.map(({ file }) => `${file.name}:${file.size}:${file.lastModified}`));
    const additions = [];
    validFiles.forEach((candidate) => {
      const signature = `${candidate.name}:${candidate.size}:${candidate.lastModified}`;
      if (knownFiles.has(signature)) return;
      if (queue.length + additions.length >= MAX_QUEUE_FILES) {
        issues.push(`${candidate.name}: the queue is limited to ${MAX_QUEUE_FILES} images.`);
        return;
      }
      knownFiles.add(signature);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const sourceUrl = URL.createObjectURL(candidate);
      sourceUrlsRef.current.set(id, sourceUrl);
      additions.push({ id, file: candidate, sourceUrl, status: "ready", output: null, error: "" });
    });
    if (additions.length) {
      setQueue((current) => [...current, ...additions]);
      if (!selectedId) setSelectedId(additions[0].id);
    }
    if (issues.length) setError(issues.join(" "));
  }

  function invalidateOutputs() {
    downloadUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    downloadUrlsRef.current.clear();
    setQueue((current) => current.map((entry) => ({
      ...entry,
      status: entry.status === "processing" ? entry.status : "ready",
      output: null,
      error: "",
    })));
  }

  function applyPreset(preset) {
    setActivePreset(preset.id);
    setPresetCategory(GENERAL_PRESETS.some(({ id }) => id === preset.id) ? "general" : "exam");
    setWidth(preset.width);
    setHeight(preset.height);
    setMaxKB(preset.maxKB);
    setAspectRatio(preset.width / preset.height);
    invalidateOutputs();
  }

  function updateWidth(value) {
    if (value === "") {
      setWidth("");
      setActivePreset("");
      invalidateOutputs();
      return;
    }
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1 || next > 10000) {
      setWidth(value);
      setActivePreset("");
      invalidateOutputs();
      return;
    }
    setWidth(next);
    if (ratioLocked) setHeight(Math.min(10000, Math.max(1, Math.round(next / aspectRatio))));
    setActivePreset("");
    invalidateOutputs();
  }

  function updateHeight(value) {
    if (value === "") {
      setHeight("");
      setActivePreset("");
      invalidateOutputs();
      return;
    }
    const next = Number(value);
    if (!Number.isInteger(next) || next < 1 || next > 10000) {
      setHeight(value);
      setActivePreset("");
      invalidateOutputs();
      return;
    }
    setHeight(next);
    if (ratioLocked) setWidth(Math.min(10000, Math.max(1, Math.round(next * aspectRatio))));
    setActivePreset("");
    invalidateOutputs();
  }

  function updateMaxKB(value) {
    if (value === "") {
      setMaxKB("");
      invalidateOutputs();
      return;
    }
    const next = Number(value);
    if (!Number.isFinite(next) || next < 1 || next > 10000) {
      setMaxKB(value);
      invalidateOutputs();
      return;
    }
    setMaxKB(Math.round(next));
    invalidateOutputs();
  }

  function updateEnhancer(enabled) {
    setEnhanceSignature(enabled);
    invalidateOutputs();
  }

  function toggleRatioLock() {
    if (!ratioLocked) setAspectRatio(normalizeInput(width) / normalizeInput(height));
    setRatioLocked((locked) => !locked);
  }

  function removeFromQueue(id) {
    const url = sourceUrlsRef.current.get(id);
    if (url) URL.revokeObjectURL(url);
    sourceUrlsRef.current.delete(id);
    const downloadUrl = downloadUrlsRef.current.get(id);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrlsRef.current.delete(id);
    if (selectedId === id) setSelectedId(queue.find((entry) => entry.id !== id)?.id || null);
    setQueue((current) => current.filter((entry) => entry.id !== id));
  }

  async function handleResizeQueue() {
    if (busy) return;
    const pending = queue.filter((entry) => entry.status !== "processing" && !entry.output);
    if (!pending.length) return;
    setBusy(true);
    setError("");
    try {
      for (const entry of pending) {
        setQueue((current) => current.map((item) => item.id === entry.id ? { ...item, status: "processing", error: "" } : item));
        try {
          const result = await resizeImage(entry.file, width, height, maxKB, enhanceSignature);
          const downloadUrl = URL.createObjectURL(dataUrlToBlob(result.dataUrl));
          downloadUrlsRef.current.set(entry.id, downloadUrl);
          setQueue((current) => current.map((item) => item.id === entry.id ? {
            ...item,
            status: result.meetsLimit ? "done" : "over-limit",
            output: {
              ...result,
              downloadUrl,
              fileName: `${entry.file.name.replace(/\.[^.]+$/, "")}-${width}x${height}.jpg`,
            },
            error: "",
          } : item));
        } catch (resizeError) {
          const message = resizeError instanceof Error ? resizeError.message : "Could not process this image.";
          setQueue((current) => current.map((item) => item.id === entry.id ? { ...item, status: "error", error: message } : item));
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const selectedItem = queue.find((entry) => entry.id === selectedId) || queue[0] || null;
  const selectedFile = selectedItem?.file;
  const sourceUrl = selectedItem?.sourceUrl || "";
  const output = selectedItem?.output || null;
  const meetsLimit = output?.meetsLimit;
  const visiblePresets = presetCategory === "general" ? GENERAL_PRESETS : EXAM_PRESETS;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a className="flex min-w-0 items-center gap-3" href="#" aria-label="VisionCrop Infinity home">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-blue-600/20">
              <Icon name="infinity" className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block whitespace-nowrap text-[15px] font-extrabold tracking-tight text-ink sm:text-base">VisionCrop <span className="text-brand-600">Infinity</span></span>
              <span className="block whitespace-nowrap text-[9px] font-bold tracking-[0.12em] text-slate-500 sm:text-[10px] sm:tracking-[0.16em]">FREE IMAGE RESIZER & COMPRESSOR</span>
            </span>
          </a>
          <div className="flex items-center gap-2 sm:gap-4">
            <nav aria-label="Page sections" className="hidden items-center gap-5 text-sm font-semibold text-slate-600 md:flex">
              <a href="#about" className="transition-colors duration-200 hover:text-brand-700">About</a>
              <a href="#faq" className="transition-colors duration-200 hover:text-brand-700">FAQ</a>
            </nav>
            <button type="button" onClick={copyPageLink} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50 hover:text-brand-700 hover:shadow-sm active:translate-y-0 sm:gap-2 sm:px-3">
              <Icon name="copy" className="h-4 w-4" />
              <span>{shareStatus || "Copy link"}</span>
            </button>
            <span aria-live="polite" className="sr-only">{shareStatus}</span>
            <div className="hidden items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 lg:flex">
              <Icon name="shield" className="h-4 w-4" />
              Private, on-device processing
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-bold text-brand-700 shadow-sm">
            <Icon name="sparkles" className="h-4 w-4" />
            Precise image sizing, made simple
          </div>
          <h1 className="text-4xl font-black leading-[1.08] tracking-[-0.045em] text-ink sm:text-6xl">
            Every image, <span className="text-brand-600">just right.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
            Resize and compress photos for job applications, document uploads, passport photos,
            portal forms, competitive exams, and the web — privately in your browser.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 text-xs font-semibold text-slate-600">
            {["No uploads", "Exact pixel dimensions", "Target file size"].map((item) => (
              <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">{item}</span>
            ))}
          </div>
        </div>

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <section className="space-y-7">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-7">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Step 1</p>
                  <h2 className="mt-1 text-xl font-extrabold tracking-tight text-ink">Start with a preset</h2>
                  <p className="mt-1 text-sm text-slate-500">Pick a useful starting point, then fine-tune the exact values.</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">Quick presets</span>
              </div>
              <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Preset category">
                {[
                  { id: "general", label: "Everyday & web" },
                  { id: "exam", label: "Exam formats" },
                ].map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    role="tab"
                    aria-selected={presetCategory === category.id}
                    disabled={busy}
                    onClick={() => setPresetCategory(category.id)}
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:px-4 ${presetCategory === category.id ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    {category.label}
                  </button>
                ))}
              </div>
              <div className={`grid grid-cols-2 gap-3 ${presetCategory === "general" ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
                {visiblePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={busy}
                    onClick={() => applyPreset(preset)}
                    aria-pressed={activePreset === preset.id}
                    className={`group rounded-xl border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ${
                      activePreset === preset.id ? "border-brand-500 bg-brand-50 ring-2 ring-blue-100" : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${activePreset === preset.id ? "text-brand-700" : "text-slate-800"}`}>{preset.exam}</span>
                      <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 shadow-sm">{preset.type}</span>
                    </span>
                    <span className="mt-2 block text-xs font-bold text-slate-700">{preset.width} × {preset.height} px</span>
                    <span className="mt-1 block text-[11px] font-medium text-slate-500">≤ {preset.maxKB} KB · {preset.hint}</span>
                  </button>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-500">Presets are convenient starting points, not official requirements. Check the destination site’s specifications before uploading.</p>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-7">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Step 2</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-ink">Set your image requirements</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr_1.1fr] sm:items-end">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-600">Width (pixels)</span>
                  <input type="number" min="1" max="10000" step="1" value={width} disabled={busy} onChange={(event) => updateWidth(event.target.value)} onBlur={(event) => updateWidth(normalizeInput(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100" />
                </label>
                <span className="hidden pb-3 text-slate-400 sm:block">×</span>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-600">Height (pixels)</span>
                  <input type="number" min="1" max="10000" step="1" value={height} disabled={busy} onChange={(event) => updateHeight(event.target.value)} onBlur={(event) => updateHeight(normalizeInput(event.target.value))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold text-slate-600">Maximum file size</span>
                  <span className="flex items-center rounded-lg border border-slate-200 px-3">
                    <input type="number" min="1" max="10000" step="1" value={maxKB} disabled={busy} onChange={(event) => updateMaxKB(event.target.value)} onBlur={(event) => updateMaxKB(normalizeInput(event.target.value))} className="w-full border-0 bg-transparent py-2.5 text-sm font-semibold text-slate-800 outline-none focus:ring-0 disabled:text-slate-400" />
                    <span className="text-xs font-semibold text-slate-500">KB</span>
                  </span>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button type="button" disabled={busy} onClick={toggleRatioLock} aria-pressed={ratioLocked} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${ratioLocked ? "bg-blue-50 text-brand-700" : "bg-slate-100 text-slate-600"}`}>
                  <Icon name="lock" className="h-4 w-4" />
                  Aspect ratio {ratioLocked ? "locked" : "unlocked"}
                </button>
                <p className="text-xs text-slate-500">{ratioLocked ? "Dimensions stay proportional" : "Width and height are independent"} · JPG output</p>
              </div>
              <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${enhanceSignature ? "border-blue-200 bg-blue-50/70" : "border-slate-200 bg-slate-50"}`}>
                <input
                  type="checkbox"
                  checked={enhanceSignature}
                  disabled={busy}
                  onChange={(event) => updateEnhancer(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>
                  <span className="block text-sm font-bold text-slate-800">Signature background enhancer</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Boosts contrast and turns gray paper into a clean white background with crisp black ink. Best for signatures and handwriting.</span>
                </span>
              </label>
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-7">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Step 3</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight text-ink">Add your image</h2>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="sr-only"
                onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
              />
              <button
                type="button"
                disabled={busy || queue.length >= MAX_QUEUE_FILES}
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
                className={`flex min-h-[145px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 text-center transition-all duration-200 hover:scale-[1.005] disabled:cursor-not-allowed disabled:opacity-60 ${dragging ? "border-brand-500 bg-blue-50 shadow-inner" : "border-slate-300 bg-slate-50/70 hover:border-brand-400 hover:bg-blue-50/50"}`}
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm"><Icon name="upload" className="h-5 w-5" /></span>
                <span className="text-sm font-bold text-slate-800">Drop images here or <span className="text-brand-600">browse files</span></span>
                <span className="mt-1 text-xs text-slate-500">JPG, PNG or WebP · up to 20 MB each · {queue.length}/{MAX_QUEUE_FILES} in queue</span>
              </button>
              {queue.length > 0 && (
                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Processing queue <span className="ml-1 text-slate-400">({queue.length})</span></p>
                    <button type="button" disabled={busy} onClick={() => { queue.forEach(({ id }) => { const url = sourceUrlsRef.current.get(id); if (url) URL.revokeObjectURL(url); sourceUrlsRef.current.delete(id); const downloadUrl = downloadUrlsRef.current.get(id); if (downloadUrl) URL.revokeObjectURL(downloadUrl); downloadUrlsRef.current.delete(id); }); setQueue([]); setSelectedId(null); }} className="text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50">Clear queue</button>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {queue.map((entry) => (
                      <li key={entry.id} className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${selectedId === entry.id ? "bg-blue-50/60" : "bg-white"}`}>
                        <button type="button" onClick={() => setSelectedId(entry.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <img src={entry.sourceUrl} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 bg-white object-contain" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-slate-800">{entry.file.name}</span>
                            <span className="mt-1 block text-[11px] text-slate-500">{formatBytes(entry.file.size)} · {entry.status === "processing" ? "Processing…" : entry.status === "done" ? `Ready · ${formatBytes(entry.output.size)}` : entry.status === "over-limit" ? `Over size limit · ${formatBytes(entry.output.size)}` : entry.status === "error" ? entry.error : "Ready to process"}</span>
                          </span>
                        </button>
                        {entry.output?.meetsLimit && (
                          <a href={entry.output.downloadUrl} download={entry.output.fileName} aria-label={`Download ${entry.file.name}`} title="Download processed image" className="rounded-lg border border-slate-200 bg-white p-2 text-brand-700 hover:border-blue-300">
                            <Icon name="download" className="h-4 w-4" />
                          </a>
                        )}
                        <button type="button" disabled={busy} onClick={() => removeFromQueue(entry.id)} aria-label={`Remove ${entry.file.name}`} title="Remove from queue" className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-40">
                          <Icon name="close" className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500">
                <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p>Your image is processed locally in this browser. It is not uploaded or sent to a server.</p>
              </div>
            </div>
          </section>

          <aside className="lg:sticky lg:top-6">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft transition-shadow duration-200 hover:shadow-md">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Your result</p>
                  <h2 className="mt-1 text-base font-bold text-ink">Preview & download</h2>
                  {selectedFile && <p className="mt-1 max-w-[220px] truncate text-xs text-slate-500">{selectedFile.name}</p>}
                </div>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-brand-600"><Icon name="image" className="h-5 w-5" /></span>
              </div>
              <div className="p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dimensions</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">{width} × {height} <span className="text-xs font-medium text-slate-500">px</span></p>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Size limit</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">≤ {maxKB} <span className="text-xs font-medium text-slate-500">KB</span></p>
                  </div>
                </div>

                <div className="mt-4 flex min-h-[280px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-200 bg-[#f9fafc] p-5">
                  {output?.dataUrl ? (
                    <img src={output.dataUrl} alt="Resized image preview" className="animate-enter max-h-[300px] max-w-full rounded-md object-contain shadow-sm" />
                  ) : sourceUrl ? (
                    <div className="text-center">
                      <img src={sourceUrl} alt="Original image preview" className="mx-auto max-h-56 max-w-full rounded-md object-contain" />
                      <p className="mt-3 text-xs text-slate-500">Original preview · resize to see your result</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm"><Icon name="image" className="h-7 w-7" /></span>
                      <p className="mt-4 text-sm font-semibold text-slate-600">Your preview will appear here</p>
                      <p className="mt-1 text-xs text-slate-400">Choose a preset and add images to get started</p>
                    </div>
                  )}
                </div>

                {output && (
                  <div className={`animate-enter mt-4 rounded-xl border p-4 ${meetsLimit ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meetsLimit ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        <Icon name={meetsLimit ? "check" : "refresh"} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className={`text-sm font-bold ${meetsLimit ? "text-emerald-800" : "text-amber-900"}`}>{meetsLimit ? "Ready for your application" : "Size limit not met"}</p>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${meetsLimit ? "bg-white text-emerald-700" : "bg-white text-amber-800"}`}>{formatBytes(output.size)} {meetsLimit ? "✓" : "!"}</span>
                        </div>
                        <p className={`mt-1 text-xs leading-5 ${meetsLimit ? "text-emerald-700" : "text-amber-800"}`}>
                          {meetsLimit
                            ? `${output.width} × ${output.height} px · Verified under ${maxKB} KB`
                            : `At these exact dimensions, the smallest JPG is still over ${maxKB} KB. Try a larger limit or smaller dimensions.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <button type="button" disabled={!queue.some((entry) => !entry.output) || busy} onClick={handleResizeQueue} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-xl active:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                  {busy ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Processing queue…</> : <><Icon name="sparkles" className="h-5 w-5" /> Process queue ({queue.filter((entry) => !entry.output).length}) <Icon name="arrow" className="h-4 w-4" /></>}
                </button>
                <a
                  href={output?.downloadUrl && meetsLimit ? output.downloadUrl : undefined}
                  download={output?.fileName}
                  aria-disabled={!output?.dataUrl || !meetsLimit}
                  onClick={(event) => { if (!output?.dataUrl || !meetsLimit) event.preventDefault(); }}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/40 hover:text-brand-700 active:translate-y-0 ${!output?.dataUrl || !meetsLimit ? "pointer-events-none cursor-not-allowed opacity-50" : ""}`}
                >
                  <Icon name="download" className="h-4 w-4" /> Download JPG
                </a>
                <p className="mt-4 text-center text-[11px] leading-5 text-slate-400">The file is encoded as JPG. Double-check your destination’s image specifications before uploading.</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-slate-500">
              <Icon name="shield" className="h-4 w-4 text-emerald-600" />
              Private by design — your images never leave your device
            </div>
          </aside>
        </div>
      </main>
      <section className="border-t border-slate-200 bg-white py-14 sm:py-20" aria-labelledby="about-heading">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
            <div id="about">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">About VisionCrop Infinity</p>
              <h2 id="about-heading" className="mt-3 text-3xl font-black tracking-tight text-ink sm:text-4xl">Image-ready, without the upload.</h2>
              <p className="mt-5 text-sm leading-7 text-slate-600">
                VisionCrop Infinity is a free, browser-based tool for cropping, resizing, and compressing images to a target KB size. Use it for UPSC, SSC, and Banking application portals, job applications, passport-style photos, document uploads, social profiles, and everyday web forms.
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Image decoding and editing happen locally in your browser with HTML5 Canvas. Your selected photos are not sent to VisionCrop servers; they stay on your device while you work.
              </p>
              <div className="mt-6 flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700"><Icon name="shield" className="h-4 w-4" /></span>
                <p className="text-xs leading-5 text-emerald-900"><strong className="font-bold">Private by design.</strong> Files are processed in this browser session and are not uploaded to a remote image-processing service.</p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-[#f9fafc] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-brand-700"><Icon name="expand" className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-extrabold text-ink">Precise sizing</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Set exact pixel dimensions and a maximum KB target. Lock proportions or unlock width and height to set each independently.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-[#f9fafc] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-brand-700"><Icon name="image" className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-extrabold text-ink">Batch queue</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Add up to 10 images per batch, process them with the same settings, review each result, and download files individually.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-[#f9fafc] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-brand-700"><Icon name="sparkles" className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-extrabold text-ink">Signature cleaner</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">Optionally convert gray paper to white and dark strokes to black for a higher-contrast signature or handwriting scan.</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-[#f9fafc] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-brand-700"><Icon name="lock" className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-extrabold text-ink">Free and on-device</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">No account or image upload is needed. JPG, PNG, and WebP files up to 20 MB each are supported by the current browser tool.</p>
              </div>
            </div>
          </div>

          <div id="faq" className="mx-auto mt-14 max-w-4xl scroll-mt-24 sm:mt-20">
            <div className="mb-6 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-600">Helpful answers</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-ink">Frequently asked questions</h2>
            </div>
            <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white px-5 sm:px-7">
              <details className="group py-5" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800">
                  Do my photos leave my device?
                  <span className="text-xl font-medium text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">No. The selected image is decoded and edited locally with HTML5 Canvas in your browser. The app does not upload your image to a server. Your browser still needs to load the website itself, but the photos you process remain on your device.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800">
                  How does the KB compression work, and is the limit guaranteed?
                  <span className="text-xl font-medium text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">The image is resized to your chosen dimensions and encoded as JPG. VisionCrop searches JPEG quality settings for a result under your target, then checks the exact exported file size. If the image cannot fit the limit at those dimensions, it reports that rather than marking it as compliant. Image content and portal rules vary, so verify the destination requirements too.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800">
                  Can I enter custom width and height independently?
                  <span className="text-xl font-medium text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Yes. Aspect ratio is unlocked by default, so editing one dimension does not change the other. Turn on the aspect-ratio lock to keep proportions; the current width-to-height ratio is used when you enable it. If the input image has a different shape, the tool center-crops it to fit the requested output.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800">
                  How does batch processing and the signature cleaner work?
                  <span className="text-xl font-medium text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Add up to 10 supported images to the queue and process them using the same dimensions, size limit, and enhancement setting. Each result can be previewed and downloaded separately. The optional signature cleaner converts pixels to black or white; it is intended for signatures and handwriting and may not suit color photos.</p>
              </details>
              <details className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-slate-800">
                  Is VisionCrop Infinity free, and what files can I use?
                  <span className="text-xl font-medium text-brand-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">The tool is free to use and needs no account. It accepts JPG, PNG, and WebP images up to 20 MB each, with up to 10 queued per batch. You can run additional batches as needed; browser memory and device performance may affect very large images.</p>
              </details>
            </div>
          </div>
        </div>
      </section>
      <footer className="border-t border-slate-200 bg-[#f9fafc] py-5 text-center text-xs text-slate-500">
        VisionCrop Infinity · Free, private, in-browser image resizing
      </footer>
    </div>
  );
}

export default App;
