import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import SignaturePad from "./SignaturePad";
import {
  TOOL_BUTTONS,
  TOOLS,
  DEFAULT_HIGHLIGHT_COLOR,
  DEFAULT_PEN_COLOR,
  DEFAULT_TEXT,
  DEFAULT_TEXT_COLOR,
  annotationLabel,
  clamp,
  cloneBytes,
  createSignatureAnnotation,
  createStrokeAnnotation,
  createTextAnnotation,
  dataUrlToBytes,
  drawAnnotationOnContext,
  duplicateAnnotation,
  formatToday,
} from "./pdfEditorUtils";
import { clearActiveSession, loadActiveSession, saveActiveSession } from "./sessionStore";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function formatAutosaveLabel(timestamp) {
  if (!timestamp) {
    return "Not saved yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  }).format(new Date(timestamp));
}

function buildPageItems(annotations, activePage) {
  return annotations.filter((annotation) => annotation.pageNumber === activePage);
}

function EditorApp() {
  const [tool, setTool] = useState(TOOLS.select);
  const [fileName, setFileName] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pages, setPages] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [status, setStatus] = useState("Open a PDF to start editing.");
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [textDraft, setTextDraft] = useState(DEFAULT_TEXT);
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [fontSize, setFontSize] = useState(0.024);
  const [penColor, setPenColor] = useState(DEFAULT_PEN_COLOR);
  const [penWidth, setPenWidth] = useState(0.004);
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR);
  const [highlightWidth, setHighlightWidth] = useState(0.018);
  const [signatureDraft, setSignatureDraft] = useState("");
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [sessionReady, setSessionReady] = useState(false);

  const fileInputRef = useRef(null);
  const pageCanvasRefs = useRef({});
  const pageRefs = useRef({});
  const annotationsRef = useRef([]);

  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const selectedAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  const pageItems = useMemo(
    () => buildPageItems(annotations, activePage),
    [annotations, activePage],
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const session = await loadActiveSession();

        if (!session || cancelled) {
          setStatus("Open a PDF to start editing.");
          return;
        }

        setTextDraft(session.textDraft ?? DEFAULT_TEXT);
        setTextColor(session.textColor ?? DEFAULT_TEXT_COLOR);
        setFontSize(session.fontSize ?? 0.024);
        setPenColor(session.penColor ?? DEFAULT_PEN_COLOR);
        setPenWidth(session.penWidth ?? 0.004);
        setHighlightColor(session.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR);
        setHighlightWidth(session.highlightWidth ?? 0.018);
        setSignatureDraft(session.signatureDraft ?? "");
        setTool(session.tool ?? TOOLS.select);

        await loadPdfFromBytes(session.pdfBytes, session.fileName ?? "Restored PDF", {
          restoredAnnotations: session.annotations ?? [],
          restoredStatus: `Restored ${session.fileName ?? "your PDF"} from local autosave.`,
          restoredPage: session.activePage ?? 1,
        });

        if (!cancelled) {
          setLastSavedAt(session.updatedAt ?? "");
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setStatus("Open a PDF to start editing.");
        }
      } finally {
        if (!cancelled) {
          setIsRestoring(false);
          setSessionReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pdfDoc || pages.length === 0) {
      return undefined;
    }

    let cancelled = false;

    async function renderPages() {
      for (const pageInfo of pages) {
        const page = await pdfDoc.getPage(pageInfo.pageNumber);
        const viewport = page.getViewport({ scale: pageInfo.scale });
        const canvas = pageCanvasRefs.current[pageInfo.pageNumber];

        if (!canvas || cancelled) {
          continue;
        }

        const context = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;
      }
    }

    renderPages();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pages]);

  useEffect(() => {
    if (!sessionReady || !pdfBytes || !fileName) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      try {
        await saveActiveSession({
          fileName,
          pdfBytes: cloneBytes(pdfBytes),
          annotations,
          activePage,
          tool,
          textDraft,
          textColor,
          fontSize,
          penColor,
          penWidth,
          highlightColor,
          highlightWidth,
          signatureDraft,
        });
        setLastSavedAt(new Date().toISOString());
      } catch (error) {
        console.error(error);
      }
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [
    activePage,
    annotations,
    fileName,
    fontSize,
    highlightColor,
    highlightWidth,
    pdfBytes,
    penColor,
    penWidth,
    sessionReady,
    signatureDraft,
    textColor,
    textDraft,
    tool,
  ]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    if (!annotations.some((annotation) => annotation.id === selectedId)) {
      setSelectedId(null);
    }
  }, [annotations, selectedId]);

  async function loadPdfFromBytes(
    sourceBytes,
    nextFileName,
    { restoredAnnotations = [], restoredStatus = "", restoredPage = 1 } = {},
  ) {
    const stableBytes = cloneBytes(sourceBytes);
    const loadingTask = pdfjsLib.getDocument({ data: stableBytes.slice() });
    const loadedPdf = await loadingTask.promise;
    const nextPages = [];

    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      const page = await loadedPdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.45, 960 / baseViewport.width);
      const viewport = page.getViewport({ scale });
      nextPages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        scale,
      });
    }

    annotationsRef.current = restoredAnnotations;
    setPdfBytes(stableBytes);
    setPdfDoc(loadedPdf);
    setPages(nextPages);
    setAnnotations(restoredAnnotations);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setFileName(nextFileName);
    setActivePage(restoredPage);
    setStatus(restoredStatus || `Loaded ${nextFileName}.`);
  }

  function recordHistorySnapshot() {
    const snapshot = structuredClone(annotationsRef.current);
    setHistory((current) => [...current.slice(-39), snapshot]);
    setFuture([]);
  }

  function applyAnnotations(updater, { recordHistory = true } = {}) {
    const current = annotationsRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;

    if (next === current) {
      return;
    }

    if (recordHistory) {
      recordHistorySnapshot();
    }

    annotationsRef.current = next;
    setAnnotations(next);
  }

  async function onFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextBytes = new Uint8Array(await file.arrayBuffer());
    await loadPdfFromBytes(nextBytes, file.name);
    setStatus(`Loaded ${file.name}. Pick a tool and click on the page.`);
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function clearWorkspace() {
    annotationsRef.current = [];
    setPdfBytes(null);
    setPdfDoc(null);
    setPages([]);
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setFileName("");
    setActivePage(1);
    setTool(TOOLS.select);
    setSignatureDraft("");
    setStatus("Cleared the current workspace.");
    setLastSavedAt("");
    clearActiveSession().catch(console.error);
  }

  function placeAnnotation(toolId, pageNumber, x, y) {
    if (toolId === TOOLS.text) {
      const annotation = createTextAnnotation(pageNumber, x, y, textDraft, textColor, fontSize);
      applyAnnotations((current) => [...current, annotation]);
      setSelectedId(annotation.id);
      return;
    }

    if (toolId === TOOLS.date) {
      const annotation = createTextAnnotation(
        pageNumber,
        x,
        y,
        formatToday(),
        textColor,
        fontSize,
      );
      applyAnnotations((current) => [...current, annotation]);
      setSelectedId(annotation.id);
      return;
    }

    if (toolId === TOOLS.check) {
      const annotation = createTextAnnotation(pageNumber, x, y, "âœ“", "#16a34a", 0.04);
      applyAnnotations((current) => [...current, annotation]);
      setSelectedId(annotation.id);
      return;
    }

    if (toolId === TOOLS.signature) {
      if (!signatureDraft) {
        setStatus("Create or upload a signature first.");
        return;
      }

      const annotation = createSignatureAnnotation(pageNumber, x, y, signatureDraft);
      applyAnnotations((current) => [...current, annotation]);
      setSelectedId(annotation.id);
    }
  }

  function handlePageClick(event, pageInfo) {
    setActivePage(pageInfo.pageNumber);

    if (!pdfDoc) {
      return;
    }

    if (tool === TOOLS.select) {
      setSelectedId(null);
      return;
    }

    if (tool === TOOLS.draw || tool === TOOLS.highlight) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    placeAnnotation(tool, pageInfo.pageNumber, x, y);
  }

  function startStroke(event, pageInfo, mode) {
    if (tool !== mode) {
      return;
    }

    event.preventDefault();
    setActivePage(pageInfo.pageNumber);

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const annotation = createStrokeAnnotation(
      pageInfo.pageNumber,
      x,
      y,
      mode === TOOLS.draw ? penColor : highlightColor,
      mode === TOOLS.draw ? penWidth : highlightWidth,
      mode,
    );

    recordHistorySnapshot();
    applyAnnotations((current) => [...current, annotation], { recordHistory: false });
    setSelectedId(annotation.id);

    const onMove = (moveEvent) => {
      const point = {
        x: clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1),
      };

      applyAnnotations(
        (current) =>
          current.map((item) =>
            item.id === annotation.id ? { ...item, points: [...item.points, point] } : item,
          ),
        { recordHistory: false },
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startDragging(event, annotation) {
    if (tool !== TOOLS.select) {
      return;
    }

    event.stopPropagation();
    setActivePage(annotation.pageNumber);
    setSelectedId(annotation.id);
    recordHistorySnapshot();

    const pageElement = event.currentTarget.closest(".page-stage");
    const rect = pageElement.getBoundingClientRect();
    const offsetX = (event.clientX - rect.left) / rect.width - annotation.x;
    const offsetY = (event.clientY - rect.top) / rect.height - annotation.y;

    const onMove = (moveEvent) => {
      const nextX = clamp((moveEvent.clientX - rect.left) / rect.width - offsetX, 0, 0.98);
      const nextY = clamp((moveEvent.clientY - rect.top) / rect.height - offsetY, 0, 0.98);

      applyAnnotations(
        (current) =>
          current.map((item) => (item.id === annotation.id ? { ...item, x: nextX, y: nextY } : item)),
        { recordHistory: false },
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function updateSelectedAnnotation(changes) {
    if (!selectedAnnotation) {
      return;
    }

    applyAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === selectedAnnotation.id ? { ...annotation, ...changes } : annotation,
      ),
    );
  }

  function deleteSelected() {
    if (!selectedAnnotation) {
      return;
    }

    applyAnnotations((current) =>
      current.filter((annotation) => annotation.id !== selectedAnnotation.id),
    );
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selectedAnnotation) {
      return;
    }

    const nextAnnotation = duplicateAnnotation(selectedAnnotation);
    applyAnnotations((current) => [...current, nextAnnotation]);
    setSelectedId(nextAnnotation.id);
  }

  function undo() {
    if (history.length === 0) {
      return;
    }

    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [structuredClone(annotationsRef.current), ...current.slice(0, 39)]);
    annotationsRef.current = previous;
    setAnnotations(previous);
    setSelectedId(null);
  }

  function redo() {
    if (future.length === 0) {
      return;
    }

    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current.slice(-39), structuredClone(annotationsRef.current)]);
    annotationsRef.current = next;
    setAnnotations(next);
    setSelectedId(null);
  }

  async function exportPdf() {
    if (!pdfBytes || !fileName) {
      return;
    }

    setIsExporting(true);
    setStatus("Preparing your edited PDF...");

    try {
      const pdf = await PDFDocument.load(pdfBytes.slice());

      for (let index = 0; index < pdf.getPageCount(); index += 1) {
        const page = pdf.getPage(index);
        const { width, height } = page.getSize();
        const pageAnnotations = annotations.filter(
          (annotation) => annotation.pageNumber === index + 1,
        );

        if (pageAnnotations.length === 0) {
          continue;
        }

        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = Math.ceil(width);
        overlayCanvas.height = Math.ceil(height);
        const context = overlayCanvas.getContext("2d", { alpha: true });

        for (const annotation of pageAnnotations) {
          await drawAnnotationOnContext(context, annotation, width, height);
        }

        const overlayBytes = dataUrlToBytes(overlayCanvas.toDataURL("image/png"));
        const overlayImage = await pdf.embedPng(overlayBytes);
        page.drawImage(overlayImage, { x: 0, y: 0, width, height });
      }

      const output = await pdf.save();
      const blob = new Blob([output], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setStatus("Downloaded your edited PDF.");
    } catch (error) {
      console.error(error);
      setStatus("Export failed. Your document is still saved locally, so you can try again.");
    } finally {
      setIsExporting(false);
    }
  }

  function jumpToPage(pageNumber) {
    setActivePage(pageNumber);
    pageRefs.current[pageNumber]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function useSignatureTool(nextSignature) {
    setSignatureDraft(nextSignature);
    setTool(TOOLS.signature);
    setStatus("Signature ready. Click anywhere on the PDF to place it.");
  }

  function renderAnnotation(annotation, pageInfo) {
    if (annotation.type === "text") {
      return (
        <button
          key={annotation.id}
          type="button"
          className={`annotation annotation-text ${
            selectedId === annotation.id ? "is-selected" : ""
          }`}
          style={{
            left: `${annotation.x * 100}%`,
            top: `${annotation.y * 100}%`,
            color: annotation.color,
            fontSize: `${annotation.fontSize * pageInfo.height}px`,
          }}
          onPointerDown={(event) => startDragging(event, annotation)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(annotation.id);
            setActivePage(annotation.pageNumber);
          }}
        >
          {annotation.text}
        </button>
      );
    }

    if (annotation.type === "signature") {
      return (
        <button
          key={annotation.id}
          type="button"
          className={`annotation annotation-signature ${
            selectedId === annotation.id ? "is-selected" : ""
          }`}
          style={{
            left: `${annotation.x * 100}%`,
            top: `${annotation.y * 100}%`,
            width: `${annotation.width * 100}%`,
            height: `${annotation.height * 100}%`,
          }}
          onPointerDown={(event) => startDragging(event, annotation)}
          onClick={(event) => {
            event.stopPropagation();
            setSelectedId(annotation.id);
            setActivePage(annotation.pageNumber);
          }}
        >
          <img src={annotation.image} alt="Signature" />
        </button>
      );
    }

    return null;
  }

  return (
    <div className="app-shell">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        hidden
        onChange={onFileChange}
      />

      <header className="topbar">
        <div className="brand-lockup">
          <p className="brand-kicker">FreePDF No Bullshit</p>
          <h1>Professional PDF editor</h1>
          <span>{fileName || "No document open"}</span>
        </div>

        <div className="toolbar-cluster">
          <button type="button" className="primary-button" onClick={openFilePicker}>
            Open PDF
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={exportPdf}
            disabled={!pdfDoc || isExporting}
          >
            {isExporting ? "Exporting..." : "Export PDF"}
          </button>
          <button type="button" className="ghost-button" onClick={clearWorkspace}>
            Clear session
          </button>
        </div>

        <div className="toolbar-tools">
          {TOOL_BUTTONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tool-chip ${tool === item.id ? "is-active" : ""}`}
              onClick={() => setTool(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="toolbar-cluster toolbar-cluster--tight">
          <button type="button" className="ghost-button" onClick={undo} disabled={!history.length}>
            Undo
          </button>
          <button type="button" className="ghost-button" onClick={redo} disabled={!future.length}>
            Redo
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setTool(TOOLS.date);
              setStatus("Date tool ready. Click on the PDF to place today's date.");
            }}
          >
            Today
          </button>
        </div>
      </header>

      <div className="statusbar">
        <span>{status}</span>
        <span>
          {isRestoring
            ? "Restoring autosave..."
            : `Autosaved locally: ${formatAutosaveLabel(lastSavedAt)}`}
        </span>
      </div>

      <div className="editor-layout">
        <aside className="page-rail surface-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Pages</p>
              <h3>Navigator</h3>
            </div>
            <span>{pages.length || 0} pages</span>
          </div>

          <div className="page-list">
            {pages.map((page) => (
              <button
                key={page.pageNumber}
                type="button"
                className={`page-list-item ${activePage === page.pageNumber ? "is-active" : ""}`}
                onClick={() => jumpToPage(page.pageNumber)}
              >
                <strong>Page {page.pageNumber}</strong>
                <span>
                  {Math.round(page.width)} x {Math.round(page.height)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="workspace">
          {!pdfDoc ? (
            <section className="empty-state">
              <p className="brand-kicker">Adobe-style essentials</p>
              <h2>Fill, sign, draw, highlight, check, and export in one place.</h2>
              <p>
                Your document and every change are autosaved locally, so refreshing the page no
                longer wipes out your progress.
              </p>
              <button type="button" className="primary-button" onClick={openFilePicker}>
                Open your first PDF
              </button>
            </section>
          ) : (
            pages.map((pageInfo) => {
              const pageAnnotations = annotations.filter(
                (annotation) => annotation.pageNumber === pageInfo.pageNumber,
              );

              return (
                <section
                  key={pageInfo.pageNumber}
                  ref={(node) => {
                    pageRefs.current[pageInfo.pageNumber] = node;
                  }}
                  className="page-card"
                >
                  <div className="page-card__meta">
                    <span>Page {pageInfo.pageNumber}</span>
                    <span>{pageAnnotations.length} item(s)</span>
                  </div>

                  <div
                    className="page-stage"
                    style={{ width: `${pageInfo.width}px`, height: `${pageInfo.height}px` }}
                  >
                    <canvas ref={(node) => (pageCanvasRefs.current[pageInfo.pageNumber] = node)} />

                    <div
                      className={`page-annotation-layer tool-${tool}`}
                      onClick={(event) => handlePageClick(event, pageInfo)}
                      onPointerDown={(event) => {
                        startStroke(event, pageInfo, TOOLS.draw);
                        startStroke(event, pageInfo, TOOLS.highlight);
                      }}
                    >
                      <svg
                        className="page-drawing-svg"
                        viewBox="0 0 1 1"
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        {pageAnnotations
                          .filter(
                            (annotation) =>
                              annotation.type === "draw" || annotation.type === "highlight",
                          )
                          .map((annotation) => (
                            <polyline
                              key={annotation.id}
                              points={annotation.points
                                .map((point) => `${point.x},${point.y}`)
                                .join(" ")}
                              stroke={annotation.color}
                              strokeOpacity={annotation.opacity ?? 1}
                              strokeWidth={annotation.strokeWidth}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              vectorEffect="non-scaling-stroke"
                            />
                          ))}
                      </svg>

                      {pageAnnotations
                        .filter(
                          (annotation) =>
                            annotation.type === "text" || annotation.type === "signature",
                        )
                        .map((annotation) => renderAnnotation(annotation, pageInfo))}
                    </div>
                  </div>
                </section>
              );
            })
          )}
        </main>

        <aside className="inspector">
          <section className="panel surface-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Tool settings</p>
                <h3>Current tool</h3>
              </div>
              <span>{tool}</span>
            </div>

            <label className="field-label">
              Text preset
              <textarea
                value={selectedAnnotation?.type === "text" ? selectedAnnotation.text : textDraft}
                onChange={(event) => {
                  const value = event.target.value;
                  if (selectedAnnotation?.type === "text") {
                    updateSelectedAnnotation({ text: value });
                    return;
                  }
                  setTextDraft(value);
                }}
                rows={4}
              />
            </label>

            <div className="field-row">
              <label className="field-label">
                Text color
                <input
                  type="color"
                  value={selectedAnnotation?.type === "text" ? selectedAnnotation.color : textColor}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (selectedAnnotation?.type === "text") {
                      updateSelectedAnnotation({ color: value });
                      return;
                    }
                    setTextColor(value);
                  }}
                />
              </label>

              <label className="field-label">
                Text size
                <input
                  type="range"
                  min="0.014"
                  max="0.06"
                  step="0.002"
                  value={
                    selectedAnnotation?.type === "text" ? selectedAnnotation.fontSize : fontSize
                  }
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (selectedAnnotation?.type === "text") {
                      updateSelectedAnnotation({ fontSize: value });
                      return;
                    }
                    setFontSize(value);
                  }}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field-label">
                Pen color
                <input
                  type="color"
                  value={penColor}
                  onChange={(event) => setPenColor(event.target.value)}
                />
              </label>

              <label className="field-label">
                Pen width
                <input
                  type="range"
                  min="0.001"
                  max="0.012"
                  step="0.001"
                  value={penWidth}
                  onChange={(event) => setPenWidth(Number(event.target.value))}
                />
              </label>
            </div>

            <div className="field-row">
              <label className="field-label">
                Highlight
                <input
                  type="color"
                  value={highlightColor}
                  onChange={(event) => setHighlightColor(event.target.value)}
                />
              </label>

              <label className="field-label">
                Highlight width
                <input
                  type="range"
                  min="0.008"
                  max="0.03"
                  step="0.002"
                  value={highlightWidth}
                  onChange={(event) => setHighlightWidth(Number(event.target.value))}
                />
              </label>
            </div>
          </section>

          <SignaturePad
            signatureDraft={signatureDraft}
            setSignatureDraft={setSignatureDraft}
            onUseSignature={useSignatureTool}
          />

          <section className="panel surface-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Selection</p>
                <h3>{annotationLabel(selectedAnnotation)}</h3>
              </div>
              <span>{selectedAnnotation ? `Page ${selectedAnnotation.pageNumber}` : "None"}</span>
            </div>

            {selectedAnnotation ? (
              <>
                {selectedAnnotation.type === "signature" ? (
                  <div className="field-row">
                    <label className="field-label">
                      Width
                      <input
                        type="range"
                        min="0.08"
                        max="0.5"
                        step="0.01"
                        value={selectedAnnotation.width}
                        onChange={(event) =>
                          updateSelectedAnnotation({ width: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Height
                      <input
                        type="range"
                        min="0.04"
                        max="0.18"
                        step="0.01"
                        value={selectedAnnotation.height}
                        onChange={(event) =>
                          updateSelectedAnnotation({ height: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {selectedAnnotation.type === "draw" || selectedAnnotation.type === "highlight" ? (
                  <div className="field-row">
                    <label className="field-label">
                      Color
                      <input
                        type="color"
                        value={selectedAnnotation.color}
                        onChange={(event) =>
                          updateSelectedAnnotation({ color: event.target.value })
                        }
                      />
                    </label>
                    <label className="field-label">
                      Width
                      <input
                        type="range"
                        min="0.001"
                        max={selectedAnnotation.type === "highlight" ? "0.03" : "0.012"}
                        step="0.001"
                        value={selectedAnnotation.strokeWidth}
                        onChange={(event) =>
                          updateSelectedAnnotation({ strokeWidth: Number(event.target.value) })
                        }
                      />
                    </label>
                  </div>
                ) : null}

                <div className="control-row">
                  <button type="button" className="ghost-button" onClick={duplicateSelected}>
                    Duplicate
                  </button>
                  <button type="button" className="ghost-button" onClick={deleteSelected}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <p className="helper-text">Select an item to edit its properties or remove it.</p>
            )}
          </section>

          <section className="panel surface-panel">
            <div className="panel-heading">
              <div>
                <p className="panel-kicker">Page items</p>
                <h3>Layer list</h3>
              </div>
              <span>Page {activePage}</span>
            </div>

            <div className="layer-list">
              {pageItems.length ? (
                pageItems.map((annotation) => (
                  <button
                    key={annotation.id}
                    type="button"
                    className={`layer-item ${selectedId === annotation.id ? "is-active" : ""}`}
                    onClick={() => {
                      setSelectedId(annotation.id);
                      setActivePage(annotation.pageNumber);
                    }}
                  >
                    <strong>{annotationLabel(annotation)}</strong>
                    <span>{annotation.type === "text" ? annotation.text : annotation.id}</span>
                  </button>
                ))
              ) : (
                <p className="helper-text">No items placed on this page yet.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

export default EditorApp;

