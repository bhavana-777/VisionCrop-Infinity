import { useEffect, useRef, useState } from "react";
import { createImagePreviewURL, loadImage, isSupportedImage } from "./imageFiles";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_PIXELS = 25_000_000;
const MAX_FILES = 10;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
const FORMAT_OPTIONS = {
  JPG: { mimeType: "image/jpeg", extension: "jpg" },
  PNG: { mimeType: "image/png", extension: "png" },
  WebP: { mimeType: "image/webp", extension: "webp" },
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-4 w-4">
      <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" />
    </svg>
  );
}

function canvasForImage(image, whiteBackground) {
  if (image.naturalWidth * image.naturalHeight > MAX_OUTPUT_PIXELS) {
    throw new Error("This image is too large to convert safely in this browser (maximum 25 megapixels).");
  }
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { alpha: !whiteBackground });
  if (!context) throw new Error("Your browser could not prepare this image for conversion.");
  if (whiteBackground) {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0);
  return canvas;
}

function fileBaseName(fileName) {
  return fileName.replace(/\.[^.]+$/, "") || "image";
}

function saveCanvas(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Your browser could not encode this image. Please try another file."));
    }, mimeType, quality);
  }).then((blob) => {
    if (blob.type !== mimeType) {
      throw new Error(`This browser cannot encode images as ${mimeType.replace("image/", "").toUpperCase()}.`);
    }
    return blob;
  });
}

function ImageCards({ files, busy, onRemove, showOutput }) {
  if (!files.length) return null;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {files.map((entry) => (
        <li key={entry.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <img
            src={showOutput && entry.outputUrl ? entry.outputUrl : entry.previewUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-contain"
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-slate-800" title={entry.file.name}>{entry.file.name}</span>
            <span className="mt-1 block text-[11px] text-slate-500">{formatBytes(entry.file.size)}</span>
            {entry.error && <span role="alert" className="mt-1 block text-[11px] text-red-600">{entry.error}</span>}
            {showOutput && entry.outputUrl && (
              <a href={entry.outputUrl} download={entry.outputName} className="mt-1 inline-block text-xs font-bold text-brand-700 hover:text-brand-800">
                Download {entry.outputName.split(".").pop().toUpperCase()}
              </a>
            )}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(entry.id)}
            aria-label={`Remove ${entry.file.name}`}
            title="Remove image"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RemoveIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversionWorkspace({ mode, onBusyChange }) {
  const inputRef = useRef(null);
  const filesRef = useRef([]);
  const urlsRef = useRef(new Set());
  const [files, setFiles] = useState([]);
  const [format, setFormat] = useState("JPG");
  const [quality, setQuality] = useState(90);
  const [paper, setPaper] = useState("a4");
  const [orientation, setOrientation] = useState("portrait");
  const [isAdding, setIsAdding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const busy = isAdding || isProcessing;
  const isPdf = mode === "pdf";

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    setError("");
    setStatus("");
  }, [mode]);

  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    urlsRef.current.clear();
  }, []);

  function revokeURL(url) {
    if (!url) return;
    URL.revokeObjectURL(url);
    urlsRef.current.delete(url);
  }

  function clearOutputs() {
    filesRef.current = filesRef.current.map((entry) => {
      revokeURL(entry.outputUrl);
      return { ...entry, outputUrl: "", outputName: "", error: "" };
    });
    setFiles(filesRef.current);
    setStatus("");
  }

  async function addFiles(fileList) {
    setError("");
    setStatus("");
    setIsAdding(true);
    const issues = [];
    try {
      for (const file of Array.from(fileList || [])) {
        if (!isSupportedImage(file)) {
          issues.push(`${file.name}: use JPG, PNG, WebP, or HEIC.`);
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          issues.push(`${file.name}: larger than the 20 MB limit.`);
          continue;
        }
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (filesRef.current.some((entry) => entry.key === key)) continue;
        if (filesRef.current.length >= MAX_FILES) {
          issues.push(`${file.name}: the queue is limited to ${MAX_FILES} images.`);
          continue;
        }
        try {
          const previewUrl = await createImagePreviewURL(file);
          urlsRef.current.add(previewUrl);
          const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, key, file, previewUrl, outputUrl: "", outputName: "", error: "" };
          filesRef.current = [...filesRef.current, entry];
          setFiles(filesRef.current);
        } catch (previewError) {
          issues.push(`${file.name}: ${previewError instanceof Error ? previewError.message : "Could not read this image."}`);
        }
      }
    } finally {
      setIsAdding(false);
    }
    if (issues.length) setError(issues.join(" "));
  }

  function removeFile(id) {
    const entry = filesRef.current.find((item) => item.id === id);
    if (entry) {
      revokeURL(entry.previewUrl);
      revokeURL(entry.outputUrl);
    }
    filesRef.current = filesRef.current.filter((item) => item.id !== id);
    setFiles(filesRef.current);
    setStatus("");
  }

  async function createPdf() {
    if (!filesRef.current.length || busy) return;
    setIsProcessing(true);
    setError("");
    setStatus("");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation, unit: "pt", format: paper });
      for (const [index, entry] of filesRef.current.entries()) {
        const { image, url } = await loadImage(entry.file);
        try {
          const canvas = canvasForImage(image, true);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const margin = 28;
          const scale = Math.min((pageWidth - margin * 2) / canvas.width, (pageHeight - margin * 2) / canvas.height);
          const width = canvas.width * scale;
          const height = canvas.height * scale;
          if (index > 0) pdf.addPage(paper, orientation);
          pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", (pageWidth - width) / 2, (pageHeight - height) / 2, width, height);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      pdf.save("visioncrop-images.pdf");
      setStatus(`Created a ${filesRef.current.length}-page PDF. It was generated on your device.`);
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Could not create the PDF. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function convertImages() {
    if (!filesRef.current.length || busy) return;
    setIsProcessing(true);
    setError("");
    setStatus("");
    const { mimeType, extension } = FORMAT_OPTIONS[format];
    try {
      for (const entry of filesRef.current) {
        revokeURL(entry.outputUrl);
        try {
          const { image, url } = await loadImage(entry.file);
          let blob;
          try {
            const canvas = canvasForImage(image, format === "JPG");
            blob = await saveCanvas(canvas, mimeType, format === "PNG" ? undefined : quality / 100);
          } finally {
            URL.revokeObjectURL(url);
          }
          const outputUrl = URL.createObjectURL(blob);
          urlsRef.current.add(outputUrl);
          filesRef.current = filesRef.current.map((item) => item.id === entry.id
            ? { ...item, outputUrl, outputName: `${fileBaseName(item.file.name)}.${extension}`, error: "" }
            : item);
        } catch (conversionError) {
          filesRef.current = filesRef.current.map((item) => item.id === entry.id
            ? { ...item, outputUrl: "", outputName: "", error: conversionError instanceof Error ? conversionError.message : "Could not convert this image." }
            : item);
        }
        setFiles([...filesRef.current]);
      }
      const convertedCount = filesRef.current.filter((entry) => entry.outputUrl).length;
      setStatus(convertedCount ? `Converted ${convertedCount} of ${filesRef.current.length} images. Download each result below.` : "No images could be converted.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="conversion-heading">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft sm:p-7">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">{isPdf ? "Image to PDF" : "Format converter"}</p>
          <h2 id="conversion-heading" className="mt-1 text-xl font-extrabold tracking-tight text-ink">
            {isPdf ? "Turn your images into a PDF" : "Convert images to another format"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {isPdf
              ? "Each image gets its own A4 page and is fitted proportionally. HEIC images are decoded locally."
              : "Convert JPG, PNG, WebP, or HEIC images in your browser. Your files stay on this device."}
          </p>
        </div>

        {isPdf ? (
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-600">Page size</span>
              <select value={paper} disabled={busy} onChange={(event) => setPaper(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
                <option value="a4">A4</option>
                <option value="letter">US Letter</option>
                <option value="legal">US Legal</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-600">Orientation</span>
              <select value={orientation} disabled={busy} onChange={(event) => setOrientation(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-slate-600">Target format</span>
              <select value={format} disabled={busy} onChange={(event) => { clearOutputs(); setFormat(event.target.value); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
                {Object.keys(FORMAT_OPTIONS).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Quality</span><span>{quality}%</span>
              </span>
              <input type="range" min="10" max="100" step="1" value={quality} disabled={busy || format === "PNG"} onChange={(event) => { clearOutputs(); setQuality(Number(event.target.value)); }} className="mt-2 w-full accent-brand-600 disabled:opacity-50" />
              <span className="mt-1 block text-[11px] text-slate-500">{format === "PNG" ? "PNG is lossless; quality is not applied." : "Default quality is 90%."}</span>
            </label>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          className="sr-only"
          onChange={(event) => { void addFiles(event.target.files); event.target.value = ""; }}
        />
        <div
          role="group"
          tabIndex={busy || files.length >= MAX_FILES ? -1 : 0}
          aria-label="Add images by dropping files here or browsing"
          onClick={() => { if (!busy && files.length < MAX_FILES) inputRef.current?.click(); }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !busy && files.length < MAX_FILES) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (!busy) void addFiles(event.dataTransfer.files);
          }}
          className={`flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-6 text-center transition ${isDragging ? "border-brand-500 bg-blue-50 shadow-inner" : "border-slate-300 bg-slate-50/70 hover:border-brand-400 hover:bg-blue-50/50"} ${busy || files.length >= MAX_FILES ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-6 w-6">
              <path d="M12 16V4m-5 5 5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
          </span>
          <span className="text-sm font-bold text-slate-800">Drop images here</span>
          <span className="my-2 text-xs text-slate-500">or</span>
          <button type="button" disabled={busy || files.length >= MAX_FILES} onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300">
            Browse Images
          </button>
          <span className="mt-3 text-xs text-slate-500">JPG, JPEG, PNG, WebP, HEIC · up to 20 MB each · {files.length}/{MAX_FILES}</span>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {status && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>}

        <div className="mt-5">
          <ImageCards files={files} busy={busy} onRemove={removeFile} showOutput={!isPdf} />
        </div>

        {isPdf ? (
          <button type="button" disabled={!files.length || busy} onClick={createPdf} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            {isProcessing ? <><Spinner /> Generating PDF...</> : <>Download PDF</>}
          </button>
        ) : (
          <button type="button" disabled={!files.length || busy} onClick={convertImages} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
            {isProcessing ? <><Spinner /> Converting...</> : <>Convert images</>}
          </button>
        )}
        <p className="mt-4 flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          All processing happens locally in your browser. Files are never uploaded.
        </p>
      </div>
    </section>
  );
}

export default ConversionWorkspace;
