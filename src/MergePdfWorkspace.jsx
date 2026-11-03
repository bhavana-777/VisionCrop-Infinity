import { useEffect, useRef, useState } from "react";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 50;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function MergePdfWorkspace({ onBusyChange }) {
  const inputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  function addFiles(fileList) {
    setError("");
    setStatus("");
    const additions = [];
    const issues = [];
    const knownFiles = new Set(files.map(({ key }) => key));

    for (const file of Array.from(fileList || [])) {
      const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (extension !== ".pdf" && file.type !== "application/pdf") {
        issues.push(`${file.name}: choose a PDF file.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        issues.push(`${file.name}: larger than the 100 MB per-file limit.`);
        continue;
      }
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (knownFiles.has(key)) continue;
      if (files.length + additions.length >= MAX_FILES) {
        issues.push(`${file.name}: the merge queue is limited to ${MAX_FILES} PDFs.`);
        continue;
      }
      additions.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, key, file });
      knownFiles.add(key);
    }

    if (additions.length) setFiles((current) => [...current, ...additions]);
    if (issues.length) setError(issues.join(" "));
  }

  function moveFile(index, direction) {
    setFiles((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
      return reordered;
    });
    setStatus("");
  }

  function removeFile(id) {
    setFiles((current) => current.filter((entry) => entry.id !== id));
    setStatus("");
  }

  async function mergePdfs() {
    if (busy || files.length < 2) return;
    setBusy(true);
    setError("");
    setStatus("");
    setProgress("Merging PDF files...");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const mergedPdf = await PDFDocument.create();
      let totalPages = 0;
      for (const [fileIndex, entry] of files.entries()) {
        setProgress(`Merging PDF ${fileIndex + 1} of ${files.length}...`);
        const sourcePdf = await PDFDocument.load(await entry.file.arrayBuffer());
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
        totalPages += copiedPages.length;
      }
      setProgress("Preparing merged PDF...");
      const bytes = await mergedPdf.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const firstName = files[0].file.name.replace(/\.pdf$/i, "") || "documents";
      anchor.href = url;
      anchor.download = `${firstName}-merged.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`Merged ${files.length} PDFs into one ${totalPages}-page document.`);
    } catch (mergeError) {
      setError(mergeError instanceof Error
        ? `Could not merge the selected PDFs. ${mergeError.message}`
        : "Could not merge the selected PDFs. Make sure each file is valid and not password-protected.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="merge-pdf-heading">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft sm:p-7">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Merge PDF</p>
          <h2 id="merge-pdf-heading" className="mt-1 text-xl font-extrabold tracking-tight text-ink">Combine PDF files into one</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Choose the order, then merge your files privately in this browser.</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }}
        />
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Choose or drop multiple PDF files"
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !busy) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) addFiles(event.dataTransfer.files);
          }}
          className={`flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 text-center transition ${dragging ? "border-brand-500 bg-blue-50 shadow-inner" : "border-slate-300 bg-slate-50/70 hover:border-brand-400 hover:bg-blue-50/50"} ${busy ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <span className="text-sm font-bold text-slate-800">Drop PDF files here or <span className="text-brand-600">browse files</span></span>
          <span className="mt-2 text-xs text-slate-500">Up to {MAX_FILES} PDFs · 100 MB per file</span>
        </div>

        {files.length > 0 && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Merge order <span className="ml-1 text-slate-400">({files.length})</span></p>
              <button
                type="button"
                disabled={busy || files.length >= MAX_FILES}
                onClick={() => inputRef.current?.click()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-brand-700 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add more PDFs
              </button>
            </div>
            <ol className="space-y-2">
              {files.map((entry, index) => (
                <li key={entry.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-xs font-extrabold text-brand-700">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-slate-800" title={entry.file.name}>{entry.file.name}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">{formatBytes(entry.file.size)}</span>
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" disabled={busy || index === 0} onClick={() => moveFile(index, -1)} aria-label={`Move ${entry.file.name} up`} title="Move up" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m5 12 5-5 5 5" /></svg>
                    </button>
                    <button type="button" disabled={busy || index === files.length - 1} onClick={() => moveFile(index, 1)} aria-label={`Move ${entry.file.name} down`} title="Move down" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35">
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m5 8 5 5 5-5" /></svg>
                    </button>
                    <button type="button" disabled={busy} onClick={() => removeFile(entry.id)} aria-label={`Remove ${entry.file.name}`} title="Remove PDF" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-35">
                      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m5 5 10 10M15 5 5 15" /></svg>
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {status && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>}
        <button type="button" disabled={files.length < 2 || busy} onClick={mergePdfs} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
          {busy ? <><Spinner /> {progress || "Merging PDF files..."}</> : "Merge & Download PDF"}
        </button>
        <p className="mt-4 text-center text-xs leading-5 text-slate-500">PDF files are merged on your device and are never uploaded.</p>
      </div>
    </section>
  );
}

export default MergePdfWorkspace;
