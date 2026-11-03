import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const OPERATIONS = {
  docx: { label: "Word (.docx) to PDF", accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  text: { label: "PDF to Text / Printable View", accept: ".pdf,application/pdf" },
  images: { label: "PDF to Images", accept: ".pdf,application/pdf" },
  word: { label: "PDF to Word (.docx)", accept: ".pdf,application/pdf" },
};

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

function groupItemsIntoRows(items) {
  const rows = [];
  for (const item of [...items].sort((left, right) => left.y - right.y || left.x - right.x)) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row.y - item.y) <= 2.5) {
      row.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }
  return rows;
}

function splitRowIntoCells(row) {
  const items = [...row.items].sort((left, right) => left.x - right.x);
  const cells = [];
  let cell = [];
  let previousRight = items[0]?.x || 0;
  let previousItem = null;
  for (const item of items) {
    const gap = item.x - previousRight;
    const separationThreshold = Math.max(14, ((previousItem?.fontSize || item.fontSize) + item.fontSize) * 0.75);
    if (cell.length && gap > separationThreshold) {
      cells.push(cell);
      cell = [];
    }
    cell.push(item);
    previousRight = item.x + item.width;
    previousItem = item;
  }
  if (cell.length) cells.push(cell);
  return {
    ...row,
    cells,
    columnStarts: cells.map((itemsInCell) => itemsInCell[0].x),
  };
}

function rowsShareColumns(first, next) {
  if (first.cells.length < 2 || first.cells.length !== next.cells.length) return false;
  const tolerance = 12;
  return first.columnStarts.every((start, index) => Math.abs(start - next.columnStarts[index]) <= tolerance);
}

function DocumentWorkspace({ initialMode = "docx", onBusyChange }) {
  const inputRef = useRef(null);
  const [sourceFormat, setSourceFormat] = useState(initialMode === "images" || initialMode === "word" ? "pdf" : "docx");
  const [targetFormat, setTargetFormat] = useState(initialMode === "images" ? "image/png" : initialMode === "word" ? "docx" : "pdf");
  const [file, setFile] = useState(null);
  const [pages, setPages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState("");
  const operation = sourceFormat === "docx" ? "docx" : targetFormat === "docx" ? "word" : targetFormat === "text" ? "text" : "images";

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  useEffect(() => () => {
    pages.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [pages]);

  function clearResults() {
    setPages((current) => {
      current.forEach(({ url }) => URL.revokeObjectURL(url));
      return [];
    });
    setText("");
    setError("");
    setStatus("");
  }

  function chooseFile(candidate) {
    clearResults();
    if (!candidate) {
      setFile(null);
      return;
    }
    const extension = candidate.name.slice(candidate.name.lastIndexOf(".")).toLowerCase();
    const valid = operation === "docx" ? extension === ".docx" : extension === ".pdf";
    if (!valid) {
      setFile(null);
      setError(operation === "docx" ? "Choose a Word document with a .docx extension." : "Choose a PDF file.");
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFile(null);
      setError("This file is larger than the 30 MB limit.");
      return;
    }
    setFile(candidate);
  }

  async function loadPdf() {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    return pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  }

  async function convertDocx() {
    const mammoth = await import("mammoth/mammoth.browser");
    const { jsPDF } = await import("jspdf");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    const paragraphs = result.value.replace(/\r/g, "").split("\n");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 52;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const usableWidth = pageWidth - margin * 2;
    const lineHeight = 16;
    let y = margin;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    for (const paragraph of paragraphs) {
      const lines = paragraph.trim() ? pdf.splitTextToSize(paragraph.trim(), usableWidth) : [""];
      for (const line of lines) {
        if (y + lineHeight > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        if (line) pdf.text(line, margin, y);
        y += lineHeight;
      }
      y += 5;
    }
    pdf.save(`${file.name.replace(/\.docx$/i, "") || "document"}.pdf`);
    setStatus("Created a text-focused PDF on this device. Complex Word styling and embedded media are not included.");
  }

  async function extractPdfText() {
    const pdf = await loadPdf();
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has more than ${MAX_PDF_PAGES} pages; split it into smaller files first.`);
    const extractedPages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = [];
      let previousY;
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const currentY = item.transform[5];
        if (previousY !== undefined && Math.abs(currentY - previousY) > 3) lines.push("\n");
        lines.push(item.str);
        if (item.hasEOL) lines.push("\n");
        else lines.push(" ");
        previousY = currentY;
      }
      extractedPages.push(`Page ${pageNumber}\n${lines.join("").replace(/[ \t]+\n/g, "\n").trim()}`);
    }
    setText(extractedPages.join("\n\n"));
    setStatus(`Extracted text from ${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}.`);
  }

  async function extractPdfImages() {
    const pdf = await loadPdf();
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has more than ${MAX_PDF_PAGES} pages; split it into smaller files first.`);
    const extension = targetFormat === "image/png" ? "png" : "jpg";
    const outputs = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 2200 / baseViewport.width, 2200 / baseViewport.height);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Your browser could not prepare a page image.");
        await page.render({ canvasContext: context, viewport }).promise;
        const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => {
          if (result) resolve(result);
          else reject(new Error(`Could not export PDF page ${pageNumber} as an image.`));
        }, targetFormat, targetFormat === "image/jpeg" ? 0.92 : undefined));
        const stem = file.name.replace(/\.pdf$/i, "") || "document";
        outputs.push({ name: `${stem}-page-${pageNumber}.${extension}`, url: URL.createObjectURL(blob) });
        canvas.width = 0;
        canvas.height = 0;
      }
      setPages(outputs);
      setStatus(`Exported ${outputs.length} ${outputs.length === 1 ? "page" : "pages"} as ${extension.toUpperCase()} images.`);
    } catch (renderError) {
      outputs.forEach(({ url }) => URL.revokeObjectURL(url));
      throw renderError;
    }
  }

  async function convertPdfToWord() {
    const pdf = await loadPdf();
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`This PDF has more than ${MAX_PDF_PAGES} pages; split it into smaller files first.`);
    const pageData = [];
    let extractedCharacters = 0;
    let extractedTokens = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      setProgress(`Reading PDF text... ${pageNumber}/${pdf.numPages}`);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => "str" in item && item.str.trim())
        .map((item) => {
          const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          const fontSize = Math.max(6, Math.hypot(item.transform[0], item.transform[1]));
          const style = content.styles[item.fontName];
          const fontFamily = style?.fontFamily || "";
          const fontName = `${item.fontName} ${fontFamily}`.toLowerCase();
          return {
            text: item.str.replace(/\s+/g, " ").trim(),
            x,
            y,
            width: item.width,
            fontSize,
            font: /mono|courier/i.test(fontFamily) ? "Courier New" : /serif/i.test(fontFamily) && !/sans/i.test(fontFamily) ? "Times New Roman" : "Arial",
            bold: /bold|black|heavy|demi|semibold/.test(fontName),
            italic: /italic|oblique/.test(fontName),
          };
        });
      const pageText = items.map(({ text }) => text).join(" ");
      extractedCharacters += pageText.length;
      extractedTokens += pageText.trim() ? pageText.trim().split(/\s+/).length : 0;
      pageData.push({ page, viewport, items });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    const scannedDocument = extractedCharacters < 24 && extractedTokens < 5;
    if (scannedDocument) {
      setStatus("Scanned document detected — extracting text via browser OCR");
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1);
      try {
        for (const [pageIndex, pageEntry] of pageData.entries()) {
          const pageNumber = pageIndex + 1;
          setProgress(`Scanning page ${pageNumber} of ${pdf.numPages} with OCR...`);
          const baseViewport = pageEntry.page.getViewport({ scale: 1 });
          const scale = Math.min(2, 2400 / baseViewport.width, 3200 / baseViewport.height);
          const viewport = pageEntry.page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          try {
            const context = canvas.getContext("2d", { alpha: false });
            if (!context) throw new Error("Your browser could not prepare a page for OCR.");
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            await pageEntry.page.render({ canvasContext: context, viewport }).promise;
            const recognition = await worker.recognize(canvas);
            pageEntry.items = recognition.data.words
              .filter((word) => word.text.trim() && word.confidence >= 20)
              .map((word) => ({
                text: word.text.trim(),
                x: word.bbox.x0,
                y: word.bbox.y1,
                width: word.bbox.x1 - word.bbox.x0,
                fontSize: Math.max(6, word.bbox.y1 - word.bbox.y0),
                font: "Arial",
                bold: false,
                italic: false,
              }));
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 0));
        }
      } finally {
        await worker.terminate();
      }
    }

    const {
      BorderStyle,
      Document,
      Packer,
      Paragraph,
      Table,
      TableCell,
      TableLayoutType,
      TableRow,
      TextRun,
      WidthType,
    } = await import("docx");
    const sections = [];
    let hasText = false;

    for (const [pageIndex, { viewport, items }] of pageData.entries()) {
      const pageNumber = pageIndex + 1;
      setProgress(`${scannedDocument ? "Building Word document" : "Converting PDF to Word"}... ${pageNumber}/${pdf.numPages}`);
      const rows = groupItemsIntoRows(items).map(splitRowIntoCells);

      const maxPageTwips = 31680;
      const pageScale = Math.min(1, maxPageTwips / (viewport.width * 20), maxPageTwips / (viewport.height * 20));
      const pageWidth = viewport.width * pageScale;
      const pageHeight = viewport.height * pageScale;
      let previousTop = 0;
      let previousFontSize = 0;
      const children = [];

      function runsForItems(rowItems) {
        const lineRuns = [];
        let previousRight = rowItems[0]?.x || 0;
        for (const item of rowItems) {
          const gap = item.x - previousRight;
          if (gap > item.fontSize * 0.18) {
            const spaces = Math.min(24, Math.max(1, Math.round(gap / (item.fontSize * 0.25))));
            lineRuns.push(new TextRun({ text: " ".repeat(spaces) }));
          }
          lineRuns.push(new TextRun({
            text: item.text,
            size: Math.max(12, Math.round(item.fontSize * pageScale * 2)),
            bold: item.bold,
            italics: item.italic,
            font: item.font,
          }));
          previousRight = item.x + item.width;
        }
        return lineRuns;
      }

      function appendParagraph(row, spacingBefore = 0) {
        const firstItem = row.items[0];
        const fontSize = firstItem.fontSize * pageScale;
        const top = Math.max(0, (row.y - firstItem.fontSize) * pageScale);
        const before = spacingBefore || Math.max(0, top - previousTop - previousFontSize * 1.15);
        return {
          paragraph: new Paragraph({
            children: runsForItems(row.items),
            indent: { left: Math.max(0, firstItem.x * pageScale * 20) },
            spacing: {
              before: Math.round(before * 20),
              after: 0,
            },
          }),
          top,
          fontSize,
        };
      }

      const rowBlocks = [];
      for (let rowIndex = 0; rowIndex < rows.length;) {
        const firstRow = rows[rowIndex];
        let tableEnd = rowIndex;
        while (tableEnd < rows.length && rowsShareColumns(firstRow, rows[tableEnd])) {
          if (tableEnd > rowIndex) {
            const lastRow = rows[tableEnd - 1];
            const currentRow = rows[tableEnd];
            const gap = currentRow.y - lastRow.y;
            const maxLineGap = Math.max(24, currentRow.items[0].fontSize * 3);
            if (gap > maxLineGap) break;
          }
          tableEnd += 1;
        }

        if (tableEnd - rowIndex >= 2) {
          rowBlocks.push({ type: "table", rows: rows.slice(rowIndex, tableEnd) });
          rowIndex = tableEnd;
        } else {
          rowBlocks.push({ type: "paragraph", row: firstRow });
          rowIndex += 1;
        }
      }

      for (const block of rowBlocks) {
        if (block.type === "paragraph") {
          const paragraph = appendParagraph(block.row);
          children.push(paragraph.paragraph);
          previousTop = paragraph.top;
          previousFontSize = paragraph.fontSize;
          continue;
        }

        const tableRows = block.rows;
        const firstTableRow = tableRows[0];
        const columnCount = firstTableRow.cells.length;
        const tableLeft = Math.max(0, firstTableRow.columnStarts[0] - 4);
        const columnStarts = Array.from({ length: columnCount }, (_, columnIndex) => (
          tableRows.reduce((sum, row) => sum + row.columnStarts[columnIndex], 0) / tableRows.length
        ));
        const columnRights = Array.from({ length: columnCount }, (_, columnIndex) => (
          Math.max(...tableRows.map((row) => Math.max(...row.cells[columnIndex].map((item) => item.x + item.width))))
        ));
        const boundaries = [tableLeft];
        for (let columnIndex = 0; columnIndex < columnCount - 1; columnIndex += 1) {
          const textEnd = columnRights[columnIndex];
          const nextStart = columnStarts[columnIndex + 1];
          const boundary = nextStart > textEnd
            ? (textEnd + nextStart) / 2
            : (columnStarts[columnIndex] + nextStart) / 2;
          boundaries.push(Math.max(boundaries[boundaries.length - 1] + 12, boundary));
        }
        boundaries.push(Math.max(boundaries[boundaries.length - 1] + 24, columnRights[columnCount - 1] + 4));
        const rawColumnWidths = boundaries.slice(1).map((boundary, index) => Math.max(240, (boundary - boundaries[index]) * pageScale * 20));
        const tableWidth = rawColumnWidths.reduce((sum, width) => sum + width, 0);
        const tableRowsDocx = tableRows.map((row, rowIndex) => {
          const priorRow = tableRows[rowIndex - 1];
          const rowGap = priorRow ? Math.max(0, (row.y - priorRow.y) * pageScale - row.items[0].fontSize * pageScale * 1.15) : 0;
          return new TableRow({
            children: row.cells.map((cellItems, cellIndex) => new TableCell({
              width: { size: rawColumnWidths[cellIndex], type: WidthType.DXA },
              margins: { top: 35, bottom: 35, left: 60, right: 60 },
              children: [new Paragraph({
                children: runsForItems(cellItems),
                spacing: { before: Math.round(rowGap * 20), after: 0 },
              })],
            })),
          });
        });
        const firstItem = firstTableRow.items[0];
        const tableTop = Math.max(0, (firstTableRow.y - firstItem.fontSize) * pageScale);
        const tableSpacing = Math.max(0, tableTop - previousTop - previousFontSize * 1.15);
        if (tableSpacing > 0) children.push(new Paragraph({ text: "", spacing: { before: Math.round(tableSpacing * 20), after: 0 } }));
        children.push(new Table({
          rows: tableRowsDocx,
          width: { size: tableWidth, type: WidthType.DXA },
          columnWidths: rawColumnWidths,
          indent: { size: Math.max(0, tableLeft * pageScale * 20), type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: "D7DEE8" },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: "D7DEE8" },
            left: { style: BorderStyle.SINGLE, size: 4, color: "D7DEE8" },
            right: { style: BorderStyle.SINGLE, size: 4, color: "D7DEE8" },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E5EAF1" },
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E5EAF1" },
          },
        }));
        const lastRow = tableRows[tableRows.length - 1];
        previousTop = Math.max(0, (lastRow.y - lastRow.items[0].fontSize) * pageScale);
        previousFontSize = lastRow.items[0].fontSize * pageScale;
      }

      hasText ||= children.length > 0;
      sections.push({
        properties: {
          page: {
            size: {
              width: Math.max(1, Math.round(pageWidth * 20)),
              height: Math.max(1, Math.round(pageHeight * 20)),
            },
            margin: { top: 0, right: 0, bottom: 0, left: 0, header: 0, footer: 0 },
          },
        },
        children: children.length ? children : [new Paragraph("")],
      });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }

    if (!hasText) {
      throw new Error(scannedDocument
        ? "Browser OCR could not recognize readable text in this PDF. Try a clearer scan or a different document."
        : "This PDF has no readable text to convert.");
    }

    setProgress("Preparing Word document...");
    const wordDocument = new Document({
      sections,
    });
    const blob = await Packer.toBlob(wordDocument);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file.name.replace(/\.pdf$/i, "") || "document"}.docx`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(`${scannedDocument ? "Scanned document detected — extracting text via browser OCR. " : ""}Created an editable Word document from ${pdf.numPages} ${pdf.numPages === 1 ? "page" : "pages"}. Page dimensions, text placement, font sizing, bold, and italic styling were reconstructed where available; graphics and exact font appearance may differ.`);
  }

  async function processFile() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    setProgress(operation === "word" ? "Converting PDF to Word..." : "");
    try {
      if (operation === "docx") await convertDocx();
      else if (operation === "text") await extractPdfText();
      else if (operation === "word") await convertPdfToWord();
      else await extractPdfImages();
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : "Could not process this document.");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  function downloadText() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file?.name.replace(/\.pdf$/i, "") || "document"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6" aria-labelledby="document-heading">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft sm:p-7">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">Document tools</p>
          <h2 id="document-heading" className="mt-1 text-xl font-extrabold tracking-tight text-ink">Convert documents in your browser</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Word-to-PDF, PDF text extraction, and PDF page images are processed locally.</p>
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-600">Convert From</span>
            <select value={sourceFormat} disabled={busy} onChange={(event) => { const next = event.target.value; setSourceFormat(next); setTargetFormat(next === "docx" ? "pdf" : "text"); setFile(null); clearResults(); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
              <option value="docx">Word (.docx)</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold text-slate-600">Convert To</span>
            <select value={sourceFormat === "docx" ? "pdf" : targetFormat} disabled={busy} onChange={(event) => { setTargetFormat(event.target.value); clearResults(); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 disabled:bg-slate-100">
              {sourceFormat === "docx" ? (
                <option value="pdf">PDF</option>
              ) : (
                <>
                  <option value="text">Text / printable view</option>
                  <option value="image/png">Images (PNG)</option>
                  <option value="image/jpeg">Images (JPG)</option>
                  <option value="docx">Word (.docx)</option>
                </>
              )}
            </select>
          </label>
        </div>

        <input ref={inputRef} type="file" accept={OPERATIONS[operation].accept} className="sr-only" onChange={(event) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        <div
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Choose or drop a document"
          onClick={() => { if (!busy) inputRef.current?.click(); }}
          onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !busy) inputRef.current?.click(); }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); if (!busy) chooseFile(event.dataTransfer.files?.[0]); }}
          className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 text-center transition ${dragging ? "border-brand-500 bg-blue-50" : "border-slate-300 bg-slate-50/70 hover:border-brand-400 hover:bg-blue-50/50"} ${busy ? "cursor-not-allowed opacity-60" : ""}`}
        >
          <span className="text-sm font-bold text-slate-800">Drop a {operation === "docx" ? ".docx" : "PDF"} here or <span className="text-brand-600">browse files</span></span>
          <span className="mt-2 text-xs text-slate-500">Maximum file size: 30 MB</span>
          {file && <span className="mt-3 max-w-full truncate text-xs font-semibold text-slate-700">{file.name}</span>}
        </div>
        {operation === "word" && (
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Optimized for text, letters, and resumes. Highly complex nested tables will export as aligned text.
          </p>
        )}

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {status && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>}
        <button type="button" disabled={!file || busy} onClick={processFile} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
          {busy ? <><Spinner /> {progress || "Processing..."}</> : operation === "docx" ? "Download PDF" : operation === "text" ? "Extract text" : operation === "word" ? "Convert to Word (.docx)" : "Extract page images"}
        </button>

        {text && (
          <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">Extracted text</h3>
              <div className="flex gap-2">
                <button type="button" onClick={downloadText} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Download TXT</button>
                <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700">Printable view</button>
              </div>
            </div>
            <pre id="printable-document" className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700">{text}</pre>
          </div>
        )}

        {pages.length > 0 && (
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {pages.map((page) => (
              <li key={page.name} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <img src={page.url} alt="" className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-50 object-contain" />
                <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{page.name}</span>
                <a href={page.url} download={page.name} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white hover:bg-brand-700">Download</a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-center text-xs leading-5 text-slate-500">Files are processed in this browser and are never uploaded.</p>
      </div>
    </section>
  );
}

export default DocumentWorkspace;
