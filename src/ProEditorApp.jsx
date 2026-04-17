import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import SignaturePad from "./SignaturePad";
import {
  clearActiveSession,
  loadActiveSession,
  loadAutosavePreference,
  saveActiveSession,
  saveAutosavePreference,
} from "./sessionStore";
import {
  DEFAULT_HIGHLIGHT_PRESET,
  DEFAULT_NOTE_PRESET,
  DEFAULT_REDACT_PRESET,
  DEFAULT_STROKE_PRESET,
  DEFAULT_TEXT_PRESET,
  FONT_OPTIONS,
  TOOLBAR_GROUPS,
  TOOLS,
  annotationLabel,
  clamp,
  cloneBytes,
  createImageAnnotation,
  createNoteAnnotation,
  createRedactAnnotation,
  createSignatureAnnotation,
  createStrokeAnnotation,
  createSymbolAnnotation,
  createTextAnnotation,
  dataUrlToBytes,
  drawAnnotationOnContext,
  duplicateAnnotation,
  fileToDataUrl,
  formatToday,
  getSmoothStrokePath,
  hitTestAnnotation,
  moveAnnotation,
  normalizeRect,
  uid,
} from "./proEditorUtils";

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

function autosaveSummary(isRestoring, autosaveEnabled, timestamp) {
  if (!autosaveEnabled) {
    return "Autosave off";
  }

  if (isRestoring) {
    return "Restoring autosave...";
  }

  return `Autosaved: ${formatAutosaveLabel(timestamp)}`;
}

function snippetForQuery(text, query) {
  if (!query) {
    return "";
  }

  const safeText = text.replace(/\s+/g, " ").trim();
  const index = safeText.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) {
    return "";
  }

  const start = Math.max(0, index - 40);
  const end = Math.min(safeText.length, index + query.length + 80);
  return safeText.slice(start, end);
}

function UploadButton({ label, className, onChange }) {
  return (
    <label className={className}>
      <input
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onClick={(event) => {
          event.target.value = "";
        }}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  minLabel = "Smaller",
  maxLabel = "Larger",
}) {
  return (
    <label className="field">
      <div className="range-label">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="range-foot">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </label>
  );
}

function InspectorNote({ children }) {
  return <p className="inspector-note">{children}</p>;
}

function ShortcutPill({ children }) {
  return <span className="shortcut-pill">{children}</span>;
}

function normalizeTool(nextTool) {
  return nextTool === TOOLS.arrow ? TOOLS.select : nextTool;
}

function ToolIcon({ name }) {
  const props = {
    className: "tool-svg",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };

  const icons = {
    cursor: (
      <svg {...props}>
        <path d="M5 4.5v14l4.4-4.3 2.5 5.3 2.2-1-2.5-5.2H18L5 4.5Z" />
      </svg>
    ),
    text: (
      <svg {...props}>
        <path d="M5 6h14" />
        <path d="M12 6v12" />
        <path d="M8 18h8" />
      </svg>
    ),
    sign: (
      <svg {...props}>
        <path d="M4 16.5c1.7-1.5 3-2.2 4-2.2 1.4 0 1.6 1.8 3 1.8 1 0 2.4-1 4.3-3" />
        <path d="m15 13 3.7-3.7a1.9 1.9 0 1 1 2.7 2.7L17.7 15.7" />
        <path d="M4 19h16" />
      </svg>
    ),
    highlight: (
      <svg {...props}>
        <path d="m7 15 7-7 3 3-7 7H7v-3Z" />
        <path d="M14 8 16.5 5.5 19 8" />
        <path d="M5 19h14" />
      </svg>
    ),
    redact: (
      <svg {...props}>
        <rect x="5" y="6" width="14" height="12" rx="2" />
        <path d="M8 10h8" />
        <path d="M8 13h8" />
        <path d="M8 16h5" />
      </svg>
    ),
    draw: (
      <svg {...props}>
        <path d="M4 16c2-4 4.2-6 6.4-6 2.3 0 2.7 3.2 5 3.2 1.4 0 2.9-1.1 4.6-3.2" />
        <path d="m16.7 8.3 2.8-2.8a1.6 1.6 0 1 1 2.2 2.2l-2.8 2.8" />
      </svg>
    ),
    image: (
      <svg {...props}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m20 15-4.2-4.2L8 18.5" />
      </svg>
    ),
    check: (
      <svg {...props}>
        <path d="m5.5 12.5 4 4 9-9" />
      </svg>
    ),
    cross: (
      <svg {...props}>
        <path d="M7 7 17 17" />
        <path d="M17 7 7 17" />
      </svg>
    ),
    sticky: (
      <svg {...props}>
        <path d="M6 5h12a1 1 0 0 1 1 1v8.5L13.5 20H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
        <path d="M13 14h6" />
        <path d="M9 9h6" />
      </svg>
    ),
    date: (
      <svg {...props}>
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M8 4v4" />
        <path d="M16 4v4" />
        <path d="M4 10h16" />
      </svg>
    ),
    erase: (
      <svg {...props}>
        <path d="m7 15 5-8 7 7-4.5 4.5H9.5L7 15Z" />
        <path d="M13 18h6" />
      </svg>
    ),
    search: (
      <svg {...props}>
        <circle cx="11" cy="11" r="5.5" />
        <path d="m16 16 4 4" />
      </svg>
    ),
  };

  return icons[name] ?? null;
}

function ProEditorApp() {
  const [tool, setTool] = useState(TOOLS.select);
  const [fileName, setFileName] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pages, setPages] = useState([]);
  const [pageTexts, setPageTexts] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [status, setStatus] = useState("Upload a PDF to start editing.");
  const [isRestoring, setIsRestoring] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [zoom, setZoom] = useState(1.05);

  const [textPreset, setTextPreset] = useState(DEFAULT_TEXT_PRESET);
  const [strokePreset, setStrokePreset] = useState(DEFAULT_STROKE_PRESET);
  const [highlightPreset, setHighlightPreset] = useState(DEFAULT_HIGHLIGHT_PRESET);
  const [redactPreset, setRedactPreset] = useState(DEFAULT_REDACT_PRESET);
  const [notePreset, setNotePreset] = useState(DEFAULT_NOTE_PRESET);
  const [signatureDraft, setSignatureDraft] = useState("");
  const [signatureStrokeWidth, setSignatureStrokeWidth] = useState(2.8);
  const [signatureColor, setSignatureColor] = useState("#111827");
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [imageDraft, setImageDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTextId, setEditingTextId] = useState(null);

  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);

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

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    return pageTexts
      .map((text, index) => ({
        pageNumber: index + 1,
        snippet: snippetForQuery(text, searchQuery),
      }))
      .filter((result) => result.snippet);
  }, [pageTexts, searchQuery]);

  function activateTool(nextTool) {
    const safeTool = normalizeTool(nextTool);
    setTool(safeTool);
    setEditingTextId(null);
    setSignatureModalOpen(safeTool === TOOLS.signature);
    if (safeTool !== TOOLS.select) {
      setSelectedId(null);
    }
  }

  function closeSignatureModal() {
    setSignatureModalOpen(false);

    if (signatureDraft) {
      setTool(TOOLS.signature);
      setStatus("Signature ready. Click on the page to place it.");
      return;
    }

    setTool(TOOLS.select);
    setStatus("Signature creation canceled.");
  }

  function finishPlacement(annotation, options = {}) {
    const { editText = false, statusMessage = "" } = options;
    setSelectedId(annotation.id);
    setEditingTextId(editText ? annotation.id : null);
    setTool(TOOLS.select);
    if (statusMessage) {
      setStatus(statusMessage);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const nextAutosavePreference = loadAutosavePreference();
        setAutosaveEnabled(nextAutosavePreference);

        if (!nextAutosavePreference) {
          return;
        }

        const session = await loadActiveSession();
        if (!session || cancelled) {
          return;
        }

        setTool(normalizeTool(session.tool ?? TOOLS.select));
        setZoom(session.zoom ?? 1.05);
        setTextPreset(session.textPreset ?? DEFAULT_TEXT_PRESET);
        setStrokePreset(session.strokePreset ?? DEFAULT_STROKE_PRESET);
        setHighlightPreset(session.highlightPreset ?? DEFAULT_HIGHLIGHT_PRESET);
        setRedactPreset(session.redactPreset ?? DEFAULT_REDACT_PRESET);
        setNotePreset(session.notePreset ?? DEFAULT_NOTE_PRESET);
        setSignatureDraft(session.signatureDraft ?? "");
        setSignatureStrokeWidth(session.signatureStrokeWidth ?? 2.8);
        setSignatureColor(session.signatureColor ?? "#111827");
        setImageDraft(session.imageDraft ?? "");
        setSearchQuery(session.searchQuery ?? "");

        await loadPdfFromBytes(session.pdfBytes, session.fileName ?? "Restored PDF", {
          restoredAnnotations: session.annotations ?? [],
          restoredPage: session.activePage ?? 1,
          restoredStatus: `Restored ${session.fileName ?? "your PDF"} from local autosave.`,
        });

        if (!cancelled) {
          setLastSavedAt(session.updatedAt ?? "");
        }
      } catch (error) {
        console.error(error);
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
        const viewport = page.getViewport({ scale: pageInfo.scale * zoom });
        const canvas = pageCanvasRefs.current[pageInfo.pageNumber];
        if (!canvas || cancelled) {
          continue;
        }

        const context = canvas.getContext("2d");
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
      }
    }

    renderPages();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pages, zoom]);

  useEffect(() => {
    if (!sessionReady || !autosaveEnabled || !pdfBytes || !fileName) {
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
          zoom,
          textPreset,
          strokePreset,
          highlightPreset,
          redactPreset,
          notePreset,
          signatureDraft,
          signatureStrokeWidth,
          signatureColor,
          imageDraft,
          searchQuery,
        });
        setLastSavedAt(new Date().toISOString());
      } catch (error) {
        console.error(error);
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [
    activePage,
    annotations,
    autosaveEnabled,
    fileName,
    highlightPreset,
    imageDraft,
    notePreset,
    pdfBytes,
    redactPreset,
    searchQuery,
    sessionReady,
    signatureDraft,
    signatureColor,
    signatureStrokeWidth,
    strokePreset,
    textPreset,
    tool,
    zoom,
  ]);

  useEffect(() => {
    if (!sessionReady || autosaveEnabled) {
      return;
    }

    setLastSavedAt("");
    clearActiveSession().catch(console.error);
  }, [autosaveEnabled, sessionReady]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "Escape") {
        if (editingTextId) {
          setEditingTextId(null);
          return;
        }

        if (tool !== TOOLS.select) {
          setTool(TOOLS.select);
          setSignatureModalOpen(false);
          setStatus("Selection tool ready.");
          return;
        }

        if (selectedId) {
          setSelectedId(null);
        }
        return;
      }

      if (isTypingTarget || !selectedAnnotation) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteSelected, editingTextId, selectedAnnotation, selectedId, tool]);

  async function loadPdfFromBytes(
    sourceBytes,
    nextFileName,
    { restoredAnnotations = [], restoredPage = 1, restoredStatus = "" } = {},
  ) {
    const stableBytes = cloneBytes(sourceBytes);
    const loadingTask = pdfjsLib.getDocument({ data: stableBytes.slice() });
    const loadedPdf = await loadingTask.promise;
    const nextPages = [];
    const nextTexts = [];

    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      const page = await loadedPdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.75, 1200 / viewport.width);
      nextPages.push({
        pageNumber,
        width: viewport.width * scale,
        height: viewport.height * scale,
        scale,
      });

      const textContent = await page.getTextContent();
      nextTexts.push(textContent.items.map((item) => item.str).join(" "));
    }

    annotationsRef.current = restoredAnnotations;
    setPdfBytes(stableBytes);
    setPdfDoc(loadedPdf);
    setPages(nextPages);
    setPageTexts(nextTexts);
    setAnnotations(restoredAnnotations);
    setHistory([]);
    setFuture([]);
    setFileName(nextFileName);
    setActivePage(restoredPage);
    setSelectedId(null);
    setEditingTextId(null);
    setStatus(restoredStatus || `Loaded ${nextFileName}.`);
  }

  function recordHistory() {
    setHistory((current) => [...current.slice(-39), structuredClone(annotationsRef.current)]);
    setFuture([]);
  }

  function applyAnnotations(updater, options = {}) {
    const current = annotationsRef.current;
    const next = typeof updater === "function" ? updater(current) : updater;
    if (next === current) {
      return;
    }

    if (options.recordHistory !== false) {
      recordHistory();
    }

    annotationsRef.current = next;
    setAnnotations(next);
  }

  async function handlePdfUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const nextBytes = new Uint8Array(await file.arrayBuffer());
      await loadPdfFromBytes(nextBytes, file.name);
      setStatus(`Loaded ${file.name}. Choose a tool and start editing.`);
    } catch (error) {
      console.error(error);
      setStatus("This PDF could not be opened.");
    }
  }

  async function handleImageUpload(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setImageDraft(dataUrl);
      activateTool(TOOLS.image);
      setStatus("Image ready. Click anywhere on the PDF to place it.");
    } catch (error) {
      console.error(error);
      setStatus("That image could not be loaded.");
    }
  }

  function clearWorkspace() {
    annotationsRef.current = [];
    setPdfBytes(null);
    setPdfDoc(null);
    setPages([]);
    setPageTexts([]);
    setAnnotations([]);
    setHistory([]);
    setFuture([]);
    setSelectedId(null);
    setActivePage(1);
    setFileName("");
    setSearchQuery("");
    setImageDraft("");
    setSignatureDraft("");
    setSignatureStrokeWidth(2.8);
    setSignatureColor("#111827");
    setSignatureModalOpen(false);
    setEditingTextId(null);
    setTool(TOOLS.select);
    setStatus("Workspace cleared.");
    setLastSavedAt("");
    clearActiveSession().catch(console.error);
  }

  function toggleAutosave() {
    setAutosaveEnabled((current) => {
      const nextValue = !current;
      saveAutosavePreference(nextValue);

      if (!nextValue) {
        setLastSavedAt("");
        clearActiveSession().catch(console.error);
        setStatus("Autosave turned off. This PDF now stays only in the current tab unless you download it.");
      } else {
        setStatus("Autosave turned on. Your current PDF and edits will be stored locally in this browser.");
      }

      return nextValue;
    });
  }

  function getHitAnnotation(pageNumber, x, y) {
    const candidates = annotations
      .filter((annotation) => annotation.pageNumber === pageNumber)
      .slice()
      .reverse();
    return candidates.find((annotation) => hitTestAnnotation(annotation, x, y)) ?? null;
  }

  function appendSmoothedPoint(points, nextPoint, smoothing = 0.42, minDistance = 0.0012) {
    if (!points.length) {
      return [nextPoint];
    }

    const lastPoint = points[points.length - 1];
    const distance = Math.hypot(nextPoint.x - lastPoint.x, nextPoint.y - lastPoint.y);

    if (distance < minDistance) {
      return points;
    }

    return [
      ...points,
      {
        x: lastPoint.x + (nextPoint.x - lastPoint.x) * smoothing,
        y: lastPoint.y + (nextPoint.y - lastPoint.y) * smoothing,
      },
    ];
  }

  function placePointAnnotation(pageNumber, x, y, targetTool) {
    if (targetTool === TOOLS.text) {
      const annotation = createTextAnnotation(pageNumber, x, y, textPreset);
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        editText: true,
        statusMessage: "Text box placed. Type directly on the page, then click away to finish.",
      });
      return;
    }

    if (targetTool === TOOLS.date) {
      const annotation = createTextAnnotation(pageNumber, x, y, textPreset, formatToday());
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        editText: true,
        statusMessage: "Date placed. You can refine it directly on the page.",
      });
      return;
    }

    if (targetTool === TOOLS.check) {
      const annotation = createSymbolAnnotation(pageNumber, x, y, "\u2713", "#15803d");
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        statusMessage: "Check mark placed. Drag it or press Delete to remove it.",
      });
      return;
    }

    if (targetTool === TOOLS.cross) {
      const annotation = createSymbolAnnotation(pageNumber, x, y, "X", "#dc2626");
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        statusMessage: "Cross placed. Drag it or press Delete to remove it.",
      });
      return;
    }

    if (targetTool === TOOLS.signature) {
      if (!signatureDraft) {
        setStatus("Create or upload a signature first.");
        return;
      }
      const annotation = createSignatureAnnotation(pageNumber, x, y, signatureDraft);
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        statusMessage: "Signature placed. Drag it to reposition or click away to deselect.",
      });
      return;
    }

    if (targetTool === TOOLS.image) {
      if (!imageDraft) {
        setStatus("Upload an image first.");
        return;
      }
      const annotation = createImageAnnotation(pageNumber, x, y, imageDraft);
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        statusMessage: "Image placed. Drag it to reposition or press Delete to remove it.",
      });
      return;
    }

    if (targetTool === TOOLS.sticky) {
      const annotation = createNoteAnnotation(pageNumber, x, y, notePreset);
      applyAnnotations((current) => [...current, annotation]);
      finishPlacement(annotation, {
        statusMessage: "Sticky note placed. Click it again any time to edit.",
      });
    }
  }

  function handleStageClick(event, pageInfo) {
    setActivePage(pageInfo.pageNumber);

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    if (tool === TOOLS.select) {
      setSelectedId(null);
      setEditingTextId(null);
      return;
    }

    if (tool === TOOLS.erase) {
      const hit = getHitAnnotation(pageInfo.pageNumber, x, y);
      if (hit) {
        applyAnnotations((current) => current.filter((annotation) => annotation.id !== hit.id));
        setSelectedId(null);
        setEditingTextId(null);
      }
      return;
    }

    if (
      tool === TOOLS.draw ||
      tool === TOOLS.highlight ||
      tool === TOOLS.redact ||
      tool === TOOLS.search
    ) {
      return;
    }

    placePointAnnotation(pageInfo.pageNumber, x, y, tool);
  }

  function startFreehand(event, pageInfo, targetTool) {
    if (tool !== targetTool) {
      return;
    }

    event.preventDefault();
    setActivePage(pageInfo.pageNumber);

    const rect = event.currentTarget.getBoundingClientRect();
    const firstPoint = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };

    const preset = targetTool === TOOLS.draw ? strokePreset : highlightPreset;
    const annotation = createStrokeAnnotation(
      pageInfo.pageNumber,
      firstPoint.x,
      firstPoint.y,
      preset,
      targetTool,
    );

    recordHistory();
    applyAnnotations((current) => [...current, annotation], { recordHistory: false });
    setSelectedId(annotation.id);
    setEditingTextId(null);

    const onMove = (moveEvent) => {
      const nextPoint = {
        x: clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1),
      };

      applyAnnotations(
        (current) =>
          current.map((item) =>
            item.id === annotation.id
              ? {
                  ...item,
                  points: appendSmoothedPoint(
                    item.points,
                    nextPoint,
                    targetTool === TOOLS.highlight ? 0.5 : 0.42,
                    targetTool === TOOLS.highlight ? 0.0018 : 0.0012,
                  ),
                }
              : item,
          ),
        { recordHistory: false },
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setTool(TOOLS.select);
      setStatus(
        targetTool === TOOLS.highlight
          ? "Highlight placed. Click it to adjust or press Delete to remove it."
          : "Drawing placed. Click it to adjust or press Delete to remove it.",
      );
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startShapeDraw(event, pageInfo, targetTool) {
    if (tool !== targetTool) {
      return;
    }

    event.preventDefault();
    setActivePage(pageInfo.pageNumber);

    const rect = event.currentTarget.getBoundingClientRect();
    const startX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const startY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    const annotation = createRedactAnnotation(pageInfo.pageNumber, startX, startY, redactPreset.color);

    recordHistory();
    applyAnnotations((current) => [...current, annotation], { recordHistory: false });
    setSelectedId(annotation.id);
    setEditingTextId(null);

    const onMove = (moveEvent) => {
      const nextX = clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1);
      const nextY = clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1);

      applyAnnotations(
        (current) =>
          current.map((item) => {
            if (item.id !== annotation.id) {
              return item;
            }

            return { ...item, ...normalizeRect(startX, startY, nextX, nextY) };
          }),
        { recordHistory: false },
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setTool(TOOLS.select);
      setStatus("Redaction placed. Click it to adjust or press Delete to remove it.");
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function startDragAnnotation(event, annotation) {
    if (
      tool === TOOLS.draw ||
      tool === TOOLS.highlight ||
      tool === TOOLS.redact ||
      tool === TOOLS.search
    ) {
      return;
    }

    event.stopPropagation();

    if (tool === TOOLS.erase) {
      applyAnnotations((current) =>
        current.filter((candidate) => candidate.id !== annotation.id),
      );
      setSelectedId(null);
      setEditingTextId(null);
      return;
    }

    setTool(TOOLS.select);
    setSelectedId(annotation.id);
    setActivePage(annotation.pageNumber);
    setEditingTextId(null);
    recordHistory();

    const stage = event.currentTarget.closest(".stage-shell");
    const rect = stage.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / rect.width;
    const startY = (event.clientY - rect.top) / rect.height;
    const baseAnnotation = structuredClone(annotation);

    const onMove = (moveEvent) => {
      const currentX = (moveEvent.clientX - rect.left) / rect.width;
      const currentY = (moveEvent.clientY - rect.top) / rect.height;
      const deltaX = currentX - startX;
      const deltaY = currentY - startY;

      applyAnnotations(
        (current) =>
          current.map((item) =>
            item.id === annotation.id ? moveAnnotation(baseAnnotation, deltaX, deltaY) : item,
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

  function selectCanvasAnnotation(annotation, options = {}) {
    const { editText = false } = options;
    setTool(TOOLS.select);
    setSelectedId(annotation.id);
    setActivePage(annotation.pageNumber);
    setEditingTextId(editText && annotation.type === "text" ? annotation.id : null);
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
    setEditingTextId(null);
  }

  function duplicateSelected() {
    if (!selectedAnnotation) {
      return;
    }

    const next = duplicateAnnotation(selectedAnnotation);
    applyAnnotations((current) => [...current, next]);
    setSelectedId(next.id);
    setEditingTextId(next.type === "text" ? next.id : null);
  }

  function undo() {
    if (!history.length) {
      return;
    }

    const previous = history[history.length - 1];
    setHistory((current) => current.slice(0, -1));
    setFuture((current) => [structuredClone(annotationsRef.current), ...current.slice(0, 39)]);
    annotationsRef.current = previous;
    setAnnotations(previous);
    setSelectedId(null);
    setEditingTextId(null);
  }

  function redo() {
    if (!future.length) {
      return;
    }

    const next = future[0];
    setFuture((current) => current.slice(1));
    setHistory((current) => [...current.slice(-39), structuredClone(annotationsRef.current)]);
    annotationsRef.current = next;
    setAnnotations(next);
    setSelectedId(null);
    setEditingTextId(null);
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

        if (!pageAnnotations.length) {
          continue;
        }

        const overlayCanvas = document.createElement("canvas");
        const exportScale = 4;
        overlayCanvas.width = Math.ceil(width * exportScale);
        overlayCanvas.height = Math.ceil(height * exportScale);
        const context = overlayCanvas.getContext("2d", { alpha: true });
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.scale(exportScale, exportScale);

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
      setStatus(
        autosaveEnabled
          ? "Export failed. Your work is still autosaved locally in this browser."
          : "Export failed. Your work is still open in the current tab.",
      );
    } finally {
      setIsExporting(false);
    }
  }

  function jumpToPage(pageNumber) {
    setActivePage(pageNumber);
    pageRefs.current[pageNumber]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onUseSignature(nextSignature) {
    setSignatureDraft(nextSignature);
    setSignatureModalOpen(false);
    setTool(TOOLS.signature);
    setStatus("Signature ready. Click on the page to place it.");
  }

  function renderFloatingAnnotation(annotation, pageInfo) {
    if (annotation.type === "text" || annotation.type === "symbol") {
      if (annotation.type === "text" && annotation.id === editingTextId) {
        return (
          <textarea
            key={annotation.id}
            className="canvas-item canvas-text-editor"
            style={{
              left: `${annotation.x * 100}%`,
              top: `${annotation.y * 100}%`,
              color: annotation.color,
              fontSize: `${annotation.fontSize * pageInfo.height * zoom}px`,
              fontFamily: annotation.fontFamily,
              minWidth: `${Math.max(180, pageInfo.width * zoom * 0.18)}px`,
            }}
            value={annotation.text}
            autoFocus
            rows={2}
            onFocus={(event) => {
              if (annotation.text === textPreset.value || annotation.text === "Type here") {
                event.currentTarget.select();
              }
            }}
            onChange={(event) => {
              updateSelectedAnnotation({ text: event.target.value });
            }}
            onBlur={() => setEditingTextId(null)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.blur();
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          />
        );
      }

      return (
        <button
          key={annotation.id}
          type="button"
          className={`canvas-item canvas-text ${
            selectedId === annotation.id ? "is-selected" : ""
          }`}
          style={{
            left: `${annotation.x * 100}%`,
            top: `${annotation.y * 100}%`,
            color: annotation.color,
            fontSize: `${annotation.fontSize * pageInfo.height * zoom}px`,
            fontFamily: annotation.fontFamily,
          }}
          onPointerDown={(event) => startDragAnnotation(event, annotation)}
          onClick={(event) => {
            event.stopPropagation();
            if (tool === TOOLS.erase) {
              applyAnnotations((current) =>
                current.filter((candidate) => candidate.id !== annotation.id),
              );
              setSelectedId(null);
              setEditingTextId(null);
              return;
            }
            selectCanvasAnnotation(annotation);
          }}
          onDoubleClick={(event) => {
            if (annotation.type !== "text") {
              return;
            }
            event.stopPropagation();
            selectCanvasAnnotation(annotation, { editText: true });
          }}
        >
          {annotation.text}
        </button>
      );
    }

    if (annotation.type === "signature" || annotation.type === "image") {
      return (
        <button
          key={annotation.id}
          type="button"
          className={`canvas-item canvas-box ${selectedId === annotation.id ? "is-selected" : ""}`}
          style={{
            left: `${annotation.x * 100}%`,
            top: `${annotation.y * 100}%`,
            width: `${annotation.width * 100}%`,
            height: `${annotation.height * 100}%`,
          }}
          onPointerDown={(event) => startDragAnnotation(event, annotation)}
          onClick={(event) => {
            event.stopPropagation();
            if (tool === TOOLS.erase) {
              applyAnnotations((current) =>
                current.filter((candidate) => candidate.id !== annotation.id),
              );
              setSelectedId(null);
              setEditingTextId(null);
              return;
            }
            selectCanvasAnnotation(annotation);
          }}
        >
          <img src={annotation.image} alt={annotation.type} />
        </button>
      );
    }

    if (annotation.type === "sticky") {
      return (
        <button
          key={annotation.id}
          type="button"
          className={`canvas-item sticky-note ${selectedId === annotation.id ? "is-selected" : ""}`}
          style={{
            left: `${annotation.x * 100}%`,
            top: `${annotation.y * 100}%`,
            width: `${annotation.width * 100}%`,
            height: `${annotation.height * 100}%`,
            background: annotation.color,
          }}
          onPointerDown={(event) => startDragAnnotation(event, annotation)}
          onClick={(event) => {
            event.stopPropagation();
            if (tool === TOOLS.erase) {
              applyAnnotations((current) =>
                current.filter((candidate) => candidate.id !== annotation.id),
              );
              setSelectedId(null);
              setEditingTextId(null);
              return;
            }
            selectCanvasAnnotation(annotation);
          }}
        >
          <strong>{annotation.title}</strong>
          <span>{annotation.body}</span>
        </button>
      );
    }

    return null;
  }

  function renderContextPanel() {
    if (tool === TOOLS.search) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Search</p>
              <h3>Find text in this PDF</h3>
            </div>
            <span>{searchResults.length} result(s)</span>
          </div>
          <input
            className="text-input"
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search document text"
          />
          <div className="search-results">
            {searchResults.length ? (
              searchResults.map((result) => (
                <button
                  key={`${result.pageNumber}-${result.snippet}`}
                  type="button"
                  className="search-result"
                  onClick={() => jumpToPage(result.pageNumber)}
                >
                  <strong>Page {result.pageNumber}</strong>
                  <span>{result.snippet}</span>
                </button>
              ))
            ) : (
              <p className="muted-copy">Search the PDF by typed text.</p>
            )}
          </div>
        </section>
      );
    }

    if (selectedAnnotation) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Selection</p>
              <h3>{annotationLabel(selectedAnnotation)}</h3>
            </div>
            <span>Page {selectedAnnotation.pageNumber}</span>
          </div>
          <div className="shortcut-row">
            <ShortcutPill>Delete</ShortcutPill>
            <ShortcutPill>Esc</ShortcutPill>
          </div>
          <InspectorNote>
            Drag to reposition. Press <strong>Delete</strong> to remove this item or{" "}
            <strong>Esc</strong> to clear the selection.
          </InspectorNote>

          {(selectedAnnotation.type === "text" || selectedAnnotation.type === "symbol") && (
            <div className="context-stack">
              <textarea
                className="text-area"
                rows={4}
                value={selectedAnnotation.text}
                onChange={(event) => updateSelectedAnnotation({ text: event.target.value })}
              />
              <div className="field-grid">
                <label className="field">
                  <span>Color</span>
                  <input
                    type="color"
                    value={selectedAnnotation.color}
                    onChange={(event) => updateSelectedAnnotation({ color: event.target.value })}
                  />
                </label>
                <RangeField
                  label="Size"
                  value={selectedAnnotation.fontSize.toFixed(3)}
                  min="0.014"
                  max="0.07"
                  step="0.002"
                  minLabel="Smaller text"
                  maxLabel="Larger text"
                  onChange={(value) => updateSelectedAnnotation({ fontSize: value })}
                />
              </div>
              <label className="field">
                <span>Type</span>
                <select
                  value={selectedAnnotation.fontFamily}
                  onChange={(event) =>
                    updateSelectedAnnotation({ fontFamily: event.target.value })
                  }
                >
                  {FONT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {(selectedAnnotation.type === "signature" || selectedAnnotation.type === "image") && (
            <div className="field-grid">
              <RangeField
                label="Width"
                value={selectedAnnotation.width.toFixed(2)}
                min="0.08"
                max="0.5"
                step="0.01"
                minLabel="Narrower"
                maxLabel="Wider"
                onChange={(value) => updateSelectedAnnotation({ width: value })}
              />
              <RangeField
                label="Height"
                value={selectedAnnotation.height.toFixed(2)}
                min="0.05"
                max="0.4"
                step="0.01"
                minLabel="Shorter"
                maxLabel="Taller"
                onChange={(value) => updateSelectedAnnotation({ height: value })}
              />
            </div>
          )}

          {(selectedAnnotation.type === "draw" ||
            selectedAnnotation.type === "highlight" ||
            selectedAnnotation.type === "arrow") && (
            <div className="field-grid">
              <label className="field">
                <span>Color</span>
                <input
                  type="color"
                  value={selectedAnnotation.color}
                  onChange={(event) => updateSelectedAnnotation({ color: event.target.value })}
                />
              </label>
              <RangeField
                label="Width"
                value={selectedAnnotation.strokeWidth.toFixed(3)}
                min="0.001"
                max={selectedAnnotation.type === "highlight" ? "0.03" : "0.012"}
                step="0.001"
                minLabel="Finer"
                maxLabel="Bolder"
                onChange={(value) => updateSelectedAnnotation({ strokeWidth: value })}
              />
            </div>
          )}

          {selectedAnnotation.type === "redact" && (
            <label className="field">
              <span>Color</span>
              <input
                type="color"
                value={selectedAnnotation.color}
                onChange={(event) => updateSelectedAnnotation({ color: event.target.value })}
              />
            </label>
          )}

          {selectedAnnotation.type === "sticky" && (
            <>
              <label className="field">
                <span>Title</span>
                <input
                  className="text-input"
                  type="text"
                  value={selectedAnnotation.title}
                  onChange={(event) => updateSelectedAnnotation({ title: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Note</span>
                <textarea
                  className="text-area"
                  rows={4}
                  value={selectedAnnotation.body}
                  onChange={(event) => updateSelectedAnnotation({ body: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Color</span>
                <input
                  type="color"
                  value={selectedAnnotation.color}
                  onChange={(event) => updateSelectedAnnotation({ color: event.target.value })}
                />
              </label>
            </>
          )}

          <div className="context-actions">
            <button type="button" className="tool-action" onClick={duplicateSelected}>
              Duplicate
            </button>
            <button
              type="button"
              className="tool-action tool-action--danger"
              onClick={deleteSelected}
            >
              Delete
            </button>
          </div>
        </section>
      );
    }

    if (tool === TOOLS.text || tool === TOOLS.date || tool === TOOLS.check || tool === TOOLS.cross) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Text tool</p>
              <h3>Style the next text box</h3>
            </div>
            <span>Applied on placement</span>
          </div>
          <div className="shortcut-row">
            <ShortcutPill>Esc</ShortcutPill>
          </div>
          <InspectorNote>
            This tool places one item, then returns to Selection automatically so you do not create
            duplicates by accident.
          </InspectorNote>
          <textarea
            className="text-area"
            rows={4}
            value={textPreset.value}
            onChange={(event) =>
              setTextPreset((current) => ({ ...current, value: event.target.value }))
            }
          />
          <div className="field-grid">
            <label className="field">
              <span>Color</span>
              <input
                type="color"
                value={textPreset.color}
                onChange={(event) =>
                  setTextPreset((current) => ({ ...current, color: event.target.value }))
                }
              />
            </label>
            <RangeField
              label="Size"
              value={textPreset.fontSize.toFixed(3)}
              min="0.014"
              max="0.07"
              step="0.002"
              minLabel="Smaller text"
              maxLabel="Larger text"
              onChange={(value) =>
                setTextPreset((current) => ({
                  ...current,
                  fontSize: value,
                }))
              }
            />
          </div>
          <label className="field">
            <span>Type</span>
            <select
              value={textPreset.fontFamily}
              onChange={(event) =>
                setTextPreset((current) => ({ ...current, fontFamily: event.target.value }))
              }
            >
              {FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>
      );
    }

    if (tool === TOOLS.signature) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Signature</p>
              <h3>{signatureDraft ? "Place your signature" : "Create a signature"}</h3>
            </div>
            <span>{signatureDraft ? "Ready" : "Needed first"}</span>
          </div>
          {signatureDraft ? (
            <div className="signature-preview-card">
              <img src={signatureDraft} alt="Signature preview" />
            </div>
          ) : (
            <InspectorNote>
              Create or upload a signature first. Once you are happy with it, the editor will let
              you place it on the page.
            </InspectorNote>
          )}
          <div className="context-actions">
            <button
              type="button"
              className="tool-action"
              onClick={() => setSignatureModalOpen(true)}
            >
              {signatureDraft ? "Edit signature" : "Create signature"}
            </button>
          </div>
          {signatureDraft ? (
            <p className="muted-copy">When ready, click anywhere on the PDF to place it.</p>
          ) : null}
        </section>
      );
    }

    if (tool === TOOLS.image) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Image tool</p>
              <h3>Upload and place images</h3>
            </div>
            <span>{imageDraft ? "Ready" : "Waiting"}</span>
          </div>
          <InspectorNote>
            Upload one image, place it once, then the editor returns to Selection automatically.
          </InspectorNote>
          <label className="upload-tile">
            <input
              type="file"
              accept="image/*"
              hidden
              onClick={(event) => {
                event.target.value = "";
              }}
              onChange={handleImageUpload}
            />
            {imageDraft ? "Replace image" : "Upload image"}
          </label>
          {imageDraft ? <img className="image-preview" src={imageDraft} alt="Pending" /> : null}
          <p className="muted-copy">After uploading, click on the page to place it.</p>
        </section>
      );
    }

    if (
      tool === TOOLS.draw ||
      tool === TOOLS.highlight ||
      tool === TOOLS.redact
    ) {
      const preset =
        tool === TOOLS.highlight
          ? highlightPreset
          : tool === TOOLS.redact
            ? redactPreset
            : strokePreset;

      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Markup tool</p>
              <h3>{annotationLabel({ type: tool })}</h3>
            </div>
            <span>Applied while drawing</span>
          </div>
          <div className="shortcut-row">
            <ShortcutPill>Esc</ShortcutPill>
          </div>
          <InspectorNote>
            Draw once, release, and the tool switches back to Selection so the page stays easy to
            review and edit.
          </InspectorNote>
          <label className="field">
            <span>Color</span>
            <input
              type="color"
              value={preset.color}
              onChange={(event) => {
                const value = event.target.value;
                if (tool === TOOLS.highlight) {
                  setHighlightPreset((current) => ({ ...current, color: value }));
                  return;
                }
                if (tool === TOOLS.redact) {
                  setRedactPreset((current) => ({ ...current, color: value }));
                  return;
                }
                setStrokePreset((current) => ({ ...current, color: value }));
              }}
            />
          </label>
          {tool !== TOOLS.redact ? (
            <RangeField
              label="Width"
              value={(tool === TOOLS.highlight ? highlightPreset.width : strokePreset.width).toFixed(3)}
              min="0.001"
              max={tool === TOOLS.highlight ? "0.03" : "0.012"}
              step="0.001"
              minLabel="Finer"
              maxLabel="Bolder"
              onChange={(value) => {
                if (tool === TOOLS.highlight) {
                  setHighlightPreset((current) => ({ ...current, width: value }));
                  return;
                }
                setStrokePreset((current) => ({ ...current, width: value }));
              }}
            />
          ) : null}
        </section>
      );
    }

    if (tool === TOOLS.sticky) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Sticky note</p>
              <h3>Create a note</h3>
            </div>
            <span>Placed on click</span>
          </div>
          <InspectorNote>
            Place one sticky note, then the editor returns to Selection to avoid repeat inserts.
          </InspectorNote>
          <label className="field">
            <span>Title</span>
            <input
              className="text-input"
              type="text"
              value={notePreset.title}
              onChange={(event) =>
                setNotePreset((current) => ({ ...current, title: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea
              className="text-area"
              rows={4}
              value={notePreset.body}
              onChange={(event) =>
                setNotePreset((current) => ({ ...current, body: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>Color</span>
            <input
              type="color"
              value={notePreset.color}
              onChange={(event) =>
                setNotePreset((current) => ({ ...current, color: event.target.value }))
              }
            />
          </label>
        </section>
      );
    }

    if (tool === TOOLS.erase) {
      return (
        <section className="context-card">
          <div className="context-card__header">
            <div>
              <p className="context-kicker">Erase</p>
              <h3>Remove annotations</h3>
            </div>
            <span>Click an item</span>
          </div>
          <p className="muted-copy">
            Use the erase tool to click any added annotation and remove it immediately.
          </p>
          <InspectorNote>Press Esc any time to return to Selection.</InspectorNote>
        </section>
      );
    }

    return (
      <section className="context-card">
        <div className="context-card__header">
          <div>
            <p className="context-kicker">Selection</p>
            <h3>Choose a tool</h3>
          </div>
          <span>Ready</span>
        </div>
        <p className="muted-copy">
          Pick a tool from the toolbar. This panel changes to show only the settings relevant to
          that feature.
        </p>
      </section>
    );
  }

  return (
    <div className="pro-editor">
      <header className="app-header">
        <div className="brand">
          <div className="brand-badge">PDF</div>
          <div>
            <h1>QuickSignPDF</h1>
            <span>{fileName || "No document selected"}</span>
          </div>
        </div>

        <div className="header-actions">
          <UploadButton label="Upload New" className="header-button" onChange={handlePdfUpload} />
          <button type="button" className="icon-button" onClick={undo} disabled={!history.length}>
            Undo
          </button>
          <button type="button" className="icon-button" onClick={redo} disabled={!future.length}>
            Redo
          </button>
          <button
            type="button"
            className="done-button"
            onClick={exportPdf}
            disabled={!pdfDoc || isExporting}
          >
            {isExporting ? "Exporting..." : "Download"}
          </button>
        </div>
      </header>

      <section className="toolbar-row">
        <div className="toolbar-strip">
          {TOOLBAR_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tool-button ${tool === item.id ? "is-active" : ""}`}
              onClick={() => activateTool(item.id)}
            >
              <span className="tool-icon">
                <ToolIcon name={item.icon} />
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="subheader-row">
        <div className="subheader-status">
          <span>{status}</span>
          <div className="privacy-pill-row">
            <span className="privacy-pill">Runs in your browser</span>
            <span className={`privacy-pill ${autosaveEnabled ? "" : "is-neutral"}`}>
              {autosaveEnabled ? "Local autosave on" : "Local autosave off"}
            </span>
          </div>
        </div>
        <div className="subheader-actions">
          <span>{autosaveSummary(isRestoring, autosaveEnabled, lastSavedAt)}</span>
          <button type="button" className="mini-button" onClick={toggleAutosave}>
            {autosaveEnabled ? "Turn autosave off" : "Turn autosave on"}
          </button>
          <button type="button" className="mini-button" onClick={() => setZoom((value) => clamp(value - 0.1, 0.6, 2))}>
            -
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className="mini-button" onClick={() => setZoom((value) => clamp(value + 0.1, 0.6, 2))}>
            +
          </button>
          <button type="button" className="mini-button" onClick={clearWorkspace}>
            Clear
          </button>
        </div>
      </section>

      <div className="workspace-layout">
        <aside className="left-sidebar">
          <div className="sidebar-card">
            <div className="sidebar-card__header">
              <h3>Pages</h3>
              <span>{pages.length}</span>
            </div>
            <div className="page-nav">
              {pages.map((page) => (
                <button
                  key={page.pageNumber}
                  type="button"
                  className={`page-nav__item ${activePage === page.pageNumber ? "is-active" : ""}`}
                  onClick={() => jumpToPage(page.pageNumber)}
                >
                  <strong>#{page.pageNumber}</strong>
                  <span>{annotations.filter((annotation) => annotation.pageNumber === page.pageNumber).length} items</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main
          className="document-stage"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedId(null);
              setEditingTextId(null);
            }
          }}
        >
          {!pdfDoc ? (
            <section className="empty-canvas">
              <p className="landing-kicker">Free online PDF editor</p>
              <h2>Fill, sign, and edit PDFs online right in your browser.</h2>
              <p className="landing-lead">
                Upload a PDF to add signatures, fill forms, type text, draw, highlight, redact,
                and download the edited document without installing anything.
              </p>
              <p className="landing-privacy-note">
                Files are processed in your browser. Local autosave is optional and can be turned off.
              </p>

              <div className="landing-actions">
                <UploadButton label="Upload PDF" className="empty-upload" onChange={handlePdfUpload} />
                <a className="ghost-button landing-link" href="/privacy.html">
                  Privacy
                </a>
              </div>

              <div className="landing-badges">
                <span>Free to use</span>
                <span>Browser-based</span>
                <span>Fill & sign PDFs</span>
                <span>Export edited PDF</span>
              </div>

              <div className="landing-grid">
                <article className="landing-card">
                  <h3>Fill forms fast</h3>
                  <p>
                    Add text, dates, checks, and signatures for applications, visa forms, contracts,
                    onboarding, and everyday PDF paperwork.
                  </p>
                </article>
                <article className="landing-card">
                  <h3>Markup documents</h3>
                  <p>
                    Draw, highlight, redact, attach notes, and review PDFs with a clean editing
                    workflow that feels familiar to mainstream online PDF tools.
                  </p>
                </article>
                <article className="landing-card">
                  <h3>Keep control</h3>
                  <p>
                    Files stay on the device unless you choose to share them. The editor is built
                    around a privacy-first browser workflow.
                  </p>
                </article>
              </div>

              <div className="landing-steps">
                <div>
                  <strong>1</strong>
                  <span>Upload your PDF</span>
                </div>
                <div>
                  <strong>2</strong>
                  <span>Edit, sign, or fill</span>
                </div>
                <div>
                  <strong>3</strong>
                  <span>Download the finished file</span>
                </div>
              </div>

              <div className="landing-footer">
                <a href="/privacy.html">Privacy Policy</a>
                <a href="/terms.html">Terms of Use</a>
              </div>
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
                  className="page-block"
                >
                  <div className="page-block__meta">
                    <span>#{pageInfo.pageNumber}</span>
                    <span>{pageAnnotations.length} items</span>
                  </div>

                  <div
                    className="stage-shell"
                    style={{
                      width: `${pageInfo.width * zoom}px`,
                      height: `${pageInfo.height * zoom}px`,
                    }}
                  >
                    <canvas ref={(node) => (pageCanvasRefs.current[pageInfo.pageNumber] = node)} />
                    <div
                      className={`annotation-layer tool-${tool}`}
                      onClick={(event) => handleStageClick(event, pageInfo)}
                      onPointerDown={(event) => {
                        startFreehand(event, pageInfo, TOOLS.draw);
                        startFreehand(event, pageInfo, TOOLS.highlight);
                        startShapeDraw(event, pageInfo, TOOLS.redact);
                      }}
                    >
                      <svg className="shape-layer" viewBox="0 0 1 1" preserveAspectRatio="none">
                        <defs>
                          <marker
                            id="arrow-head"
                            viewBox="0 0 10 10"
                            refX="7"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                          </marker>
                        </defs>
                        {pageAnnotations
                          .filter((annotation) =>
                            ["draw", "highlight", "arrow", "redact"].includes(annotation.type),
                          )
                          .map((annotation) => {
                            if (annotation.type === "draw" || annotation.type === "highlight") {
                              return (
                                <path
                                  key={annotation.id}
                                  className={selectedId === annotation.id ? "shape-selected" : ""}
                                  d={getSmoothStrokePath(annotation.points)}
                                  stroke={annotation.color}
                                  strokeOpacity={annotation.opacity ?? 1}
                                  strokeWidth={annotation.strokeWidth}
                                  fill="none"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  onPointerDown={(event) => startDragAnnotation(event, annotation)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (tool === TOOLS.erase) {
                                      applyAnnotations((current) =>
                                        current.filter((candidate) => candidate.id !== annotation.id),
                                      );
                                      setSelectedId(null);
                                      setEditingTextId(null);
                                      return;
                                    }
                                    selectCanvasAnnotation(annotation);
                                  }}
                                />
                              );
                            }

                            if (annotation.type === "arrow") {
                              return (
                                <line
                                  key={annotation.id}
                                  className={selectedId === annotation.id ? "shape-selected" : ""}
                                  x1={annotation.x1}
                                  y1={annotation.y1}
                                  x2={annotation.x2}
                                  y2={annotation.y2}
                                  stroke={annotation.color}
                                  strokeWidth={annotation.strokeWidth}
                                  markerEnd="url(#arrow-head)"
                                  onPointerDown={(event) => startDragAnnotation(event, annotation)}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (tool === TOOLS.erase) {
                                      applyAnnotations((current) =>
                                        current.filter((candidate) => candidate.id !== annotation.id),
                                      );
                                      setSelectedId(null);
                                      setEditingTextId(null);
                                      return;
                                    }
                                    selectCanvasAnnotation(annotation);
                                  }}
                                />
                              );
                            }

                            return (
                              <rect
                                key={annotation.id}
                                className={selectedId === annotation.id ? "shape-selected" : ""}
                                x={annotation.x}
                                y={annotation.y}
                                width={annotation.width}
                                height={annotation.height}
                                fill={annotation.color}
                                onPointerDown={(event) => startDragAnnotation(event, annotation)}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (tool === TOOLS.erase) {
                                    applyAnnotations((current) =>
                                      current.filter((candidate) => candidate.id !== annotation.id),
                                    );
                                    setSelectedId(null);
                                    setEditingTextId(null);
                                    return;
                                  }
                                  selectCanvasAnnotation(annotation);
                                }}
                              />
                            );
                          })}
                      </svg>

                      {pageAnnotations
                        .filter((annotation) =>
                          ["text", "symbol", "signature", "image", "sticky"].includes(annotation.type),
                        )
                        .map((annotation) => renderFloatingAnnotation(annotation, pageInfo))}
                    </div>
                  </div>
                </section>
              );
            })
          )}
        </main>

        <aside className="right-sidebar">
          {renderContextPanel()}
        </aside>
      </div>

      {signatureModalOpen ? (
        <div className="modal-backdrop" onClick={closeSignatureModal}>
          <div
            className="signature-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Create your signature"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="signature-modal__header">
              <div>
                <p className="context-kicker">Signature</p>
                <h3>Create your signature</h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={closeSignatureModal}
              >
                Close
              </button>
            </div>

            <SignaturePad
              signatureDraft={signatureDraft}
              setSignatureDraft={setSignatureDraft}
              signatureStrokeWidth={signatureStrokeWidth}
              setSignatureStrokeWidth={setSignatureStrokeWidth}
              signatureColor={signatureColor}
              setSignatureColor={setSignatureColor}
              onUseSignature={onUseSignature}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default ProEditorApp;
