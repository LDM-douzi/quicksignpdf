import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const TOOLS = {
  select: "select",
  text: "text",
  draw: "draw",
  signature: "signature",
};

const DEFAULT_TEXT = "Type here";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function drawAnnotationOnContext(ctx, annotation, width, height) {
  if (annotation.type === "text") {
    ctx.save();
    ctx.fillStyle = annotation.color;
    ctx.font = `${Math.max(12, annotation.fontSize * height)}px "Segoe UI", sans-serif`;
    ctx.textBaseline = "top";
    const x = annotation.x * width;
    const y = annotation.y * height;
    const lines = annotation.text.split("\n");
    const lineHeight = Math.max(16, annotation.fontSize * height * 1.25);
    lines.forEach((line, index) => {
      ctx.fillText(line || " ", x, y + index * lineHeight);
    });
    ctx.restore();
    return;
  }

  if (annotation.type === "draw") {
    if (annotation.points.length < 2) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = annotation.color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1, annotation.strokeWidth * height);
    ctx.beginPath();
    annotation.points.forEach((point, index) => {
      const px = point.x * width;
      const py = point.y * height;
      if (index === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.stroke();
    ctx.restore();
  }
}

function SignaturePad({ onSave, onClear, signatureDraft, setSignatureDraft }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fffaf2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (signatureDraft) {
      const image = new Image();
      image.onload = () => {
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = signatureDraft;
    }
  }, [signatureDraft]);

  const pointFromEvent = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const start = (event) => {
    const context = canvasRef.current.getContext("2d");
    const point = pointFromEvent(event);
    drawingRef.current = true;
    context.strokeStyle = "#1f2937";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const move = (event) => {
    if (!drawingRef.current) {
      return;
    }
    const context = canvasRef.current.getContext("2d");
    const point = pointFromEvent(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const end = () => {
    if (!drawingRef.current) {
      return;
    }
    drawingRef.current = false;
    setSignatureDraft(canvasRef.current.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.fillStyle = "#fffaf2";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setSignatureDraft("");
    onClear();
  };

  return (
    <section className="panel-card">
      <div className="panel-card__header">
        <h3>Signature pad</h3>
        <span>Draw once, place it anywhere.</span>
      </div>
      <canvas
        ref={canvasRef}
        className="signature-pad"
        width={480}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <div className="stack-row">
        <button type="button" className="secondary-button" onClick={clear}>
          Clear
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => onSave(canvasRef.current.toDataURL("image/png"))}
        >
          Use signature tool
        </button>
      </div>
    </section>
  );
}

function App() {
  const [tool, setTool] = useState(TOOLS.select);
  const [fileName, setFileName] = useState("");
  const [pdfBytes, setPdfBytes] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pages, setPages] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState("Drop in a PDF to start filling and signing.");
  const [isExporting, setIsExporting] = useState(false);
  const [textDraft, setTextDraft] = useState(DEFAULT_TEXT);
  const [textColor, setTextColor] = useState("#0f172a");
  const [fontSize, setFontSize] = useState(0.024);
  const [strokeColor, setStrokeColor] = useState("#dc2626");
  const [strokeWidth, setStrokeWidth] = useState(0.004);
  const [signatureDraft, setSignatureDraft] = useState("");
  const pageCanvasRefs = useRef({});
  const signatureAssetRef = useRef("");

  const selectedAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId],
  );

  useEffect(() => {
    if (!pdfDoc || pages.length === 0) {
      return;
    }

    pages.forEach(async (pageInfo) => {
      const page = await pdfDoc.getPage(pageInfo.pageNumber);
      const viewport = page.getViewport({ scale: pageInfo.scale });
      const canvas = pageCanvasRefs.current[pageInfo.pageNumber];
      if (!canvas) {
        return;
      }
      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
    });
  }, [pdfDoc, pages]);

  const loadPdf = async (file) => {
    const bytes = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: bytes });
    const loadedPdf = await loadingTask.promise;
    const nextPages = [];

    for (let pageNumber = 1; pageNumber <= loadedPdf.numPages; pageNumber += 1) {
      const page = await loadedPdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.6, 960 / baseViewport.width);
      const viewport = page.getViewport({ scale });
      nextPages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        scale,
      });
    }

    setPdfBytes(bytes);
    setPdfDoc(loadedPdf);
    setPages(nextPages);
    setAnnotations([]);
    setSelectedId(null);
    setFileName(file.name);
    setStatus(`Loaded ${file.name}. Choose a tool and click on a page.`);
  };

  const onFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    await loadPdf(file);
  };

  const updateAnnotation = (id, updater) => {
    setAnnotations((current) =>
      current.map((annotation) =>
        annotation.id === id ? { ...annotation, ...updater(annotation) } : annotation,
      ),
    );
  };

  const startDragging = (event, annotation) => {
    if (tool !== TOOLS.select && tool !== TOOLS.text && tool !== TOOLS.signature) {
      return;
    }

    event.stopPropagation();
    const pageElement = event.currentTarget.closest(".page-stage");
    const rect = pageElement.getBoundingClientRect();
    const offsetX = (event.clientX - rect.left) / rect.width - annotation.x;
    const offsetY = (event.clientY - rect.top) / rect.height - annotation.y;

    const onMove = (moveEvent) => {
      const nextX = clamp((moveEvent.clientX - rect.left) / rect.width - offsetX, 0, 1);
      const nextY = clamp((moveEvent.clientY - rect.top) / rect.height - offsetY, 0, 1);
      updateAnnotation(annotation.id, () => ({ x: nextX, y: nextY }));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    setSelectedId(annotation.id);
  };

  const handlePageClick = (event, pageInfo) => {
    if (!pdfDoc) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    if (tool === TOOLS.text) {
      const id = uid("text");
      setAnnotations((current) => [
        ...current,
        {
          id,
          pageNumber: pageInfo.pageNumber,
          type: "text",
          text: textDraft,
          x,
          y,
          color: textColor,
          fontSize,
        },
      ]);
      setSelectedId(id);
      return;
    }

    if (tool === TOOLS.signature && signatureAssetRef.current) {
      const id = uid("signature");
      setAnnotations((current) => [
        ...current,
        {
          id,
          pageNumber: pageInfo.pageNumber,
          type: "signature",
          image: signatureAssetRef.current,
          x,
          y,
          width: 0.28,
          height: 0.1,
        },
      ]);
      setSelectedId(id);
    }
  };

  const beginDraw = (event, pageInfo) => {
    if (tool !== TOOLS.draw) {
      return;
    }

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const id = uid("draw");
    const firstPoint = {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1),
    };

    setAnnotations((current) => [
      ...current,
      {
        id,
        pageNumber: pageInfo.pageNumber,
        type: "draw",
        color: strokeColor,
        strokeWidth,
        points: [firstPoint],
      },
    ]);
    setSelectedId(id);

    const onMove = (moveEvent) => {
      const nextPoint = {
        x: clamp((moveEvent.clientX - rect.left) / rect.width, 0, 1),
        y: clamp((moveEvent.clientY - rect.top) / rect.height, 0, 1),
      };
      setAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === id
            ? { ...annotation, points: [...annotation.points, nextPoint] }
            : annotation,
        ),
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const removeSelected = () => {
    if (!selectedId) {
      return;
    }
    setAnnotations((current) => current.filter((annotation) => annotation.id !== selectedId));
    setSelectedId(null);
  };

  const renderPageOverlay = (pageInfo) => {
    const pageAnnotations = annotations.filter(
      (annotation) => annotation.pageNumber === pageInfo.pageNumber,
    );

    return (
      <div
        className={`page-annotation-layer tool-${tool}`}
        onClick={(event) => handlePageClick(event, pageInfo)}
        onPointerDown={(event) => beginDraw(event, pageInfo)}
      >
        <svg
          className="page-drawing-svg"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {pageAnnotations
            .filter((annotation) => annotation.type === "draw")
            .map((annotation) => (
              <polyline
                key={annotation.id}
                points={annotation.points.map((point) => `${point.x},${point.y}`).join(" ")}
                stroke={annotation.color}
                strokeWidth={annotation.strokeWidth}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
        </svg>
        {pageAnnotations
          .filter((annotation) => annotation.type !== "draw")
          .map((annotation) =>
            annotation.type === "text" ? (
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
                }}
              >
                {annotation.text}
              </button>
            ) : (
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
                }}
              >
                <img src={annotation.image} alt="Signature" />
              </button>
            ),
          )}
      </div>
    );
  };

  const exportPdf = async () => {
    if (!pdfBytes) {
      return;
    }

    setIsExporting(true);
    setStatus("Exporting your filled PDF...");

    try {
      const pdf = await PDFDocument.load(pdfBytes);
      const pageCount = pdf.getPageCount();

      for (let index = 0; index < pageCount; index += 1) {
        const page = pdf.getPage(index);
        const { width, height } = page.getSize();
        const pageAnnotations = annotations.filter(
          (annotation) => annotation.pageNumber === index + 1,
        );

        if (pageAnnotations.length === 0) {
          continue;
        }

        const overlayCanvas = document.createElement("canvas");
        overlayCanvas.width = Math.round(width);
        overlayCanvas.height = Math.round(height);
        const context = overlayCanvas.getContext("2d");

        for (const annotation of pageAnnotations) {
          if (annotation.type === "signature") {
            const image = new Image();
            image.src = annotation.image;
            await image.decode();
            context.drawImage(
              image,
              annotation.x * width,
              annotation.y * height,
              annotation.width * width,
              annotation.height * height,
            );
          } else {
            drawAnnotationOnContext(context, annotation, width, height);
          }
        }

        const pngBytes = dataUrlToBytes(overlayCanvas.toDataURL("image/png"));
        const png = await pdf.embedPng(pngBytes);
        page.drawImage(png, { x: 0, y: 0, width, height });
      }

      const output = await pdf.save();
      const blob = new Blob([output], { type: "application/pdf" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = fileName.replace(/\.pdf$/i, "") + "-filled.pdf";
      anchor.click();
      URL.revokeObjectURL(href);
      setStatus("Export complete. Your filled PDF has been downloaded.");
    } catch (error) {
      console.error(error);
      setStatus("Something went wrong while exporting. Try reloading the PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const applySelectedChanges = (changes) => {
    if (!selectedId) {
      return;
    }
    updateAnnotation(selectedId, () => changes);
  };

  const fillToday = () => {
    const today = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date());
    setTextDraft(today);
    setTool(TOOLS.text);
  };

  return (
    <div className="app-shell">
      <aside className="control-rail">
        <div className="hero-panel">
          <p className="eyebrow">QuickSignPDF</p>
          <h1>Fill forms, sign them, and send them back in minutes.</h1>
          <p className="hero-copy">
            Upload any downloaded PDF, place text where the form needs it, draw marks by hand,
            and stamp your signature onto the page before exporting a clean signed copy.
          </p>
          <label className="file-picker">
            <input type="file" accept="application/pdf" onChange={onFileChange} />
            <span>{pdfDoc ? "Replace PDF" : "Choose a PDF"}</span>
          </label>
          <p className="status-text">{status}</p>
        </div>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Tools</h2>
            <span>{fileName || "No document loaded"}</span>
          </div>
          <div className="tool-grid">
            {Object.values(TOOLS).map((toolName) => (
              <button
                key={toolName}
                type="button"
                className={`tool-button ${tool === toolName ? "is-active" : ""}`}
                onClick={() => setTool(toolName)}
              >
                {toolName}
              </button>
            ))}
          </div>
          <div className="quick-actions">
            <button type="button" className="secondary-button" onClick={fillToday}>
              Insert today&apos;s date
            </button>
            <button type="button" className="secondary-button" onClick={removeSelected}>
              Delete selected
            </button>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h3>Text settings</h3>
            <span>Use this for names, dates, addresses, and form answers.</span>
          </div>
          <label className="field-label">
            Default text
            <textarea
              value={selectedAnnotation?.type === "text" ? selectedAnnotation.text : textDraft}
              onChange={(event) => {
                const value = event.target.value;
                if (selectedAnnotation?.type === "text") {
                  applySelectedChanges({ text: value });
                } else {
                  setTextDraft(value);
                }
              }}
              rows={4}
            />
          </label>
          <div className="field-row">
            <label className="field-label">
              Color
              <input
                type="color"
                value={selectedAnnotation?.type === "text" ? selectedAnnotation.color : textColor}
                onChange={(event) => {
                  const value = event.target.value;
                  if (selectedAnnotation?.type === "text") {
                    applySelectedChanges({ color: value });
                  } else {
                    setTextColor(value);
                  }
                }}
              />
            </label>
            <label className="field-label">
              Size
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
                    applySelectedChanges({ fontSize: value });
                  } else {
                    setFontSize(value);
                  }
                }}
              />
            </label>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h3>Pen settings</h3>
            <span>Great for initials, check marks, and handwritten notes.</span>
          </div>
          <div className="field-row">
            <label className="field-label">
              Ink
              <input
                type="color"
                value={strokeColor}
                onChange={(event) => setStrokeColor(event.target.value)}
              />
            </label>
            <label className="field-label">
              Width
              <input
                type="range"
                min="0.001"
                max="0.012"
                step="0.001"
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
              />
            </label>
          </div>
        </section>

        <SignaturePad
          signatureDraft={signatureDraft}
          setSignatureDraft={setSignatureDraft}
          onClear={() => {
            signatureAssetRef.current = "";
          }}
          onSave={(dataUrl) => {
            signatureAssetRef.current = dataUrl;
            setSignatureDraft(dataUrl);
            setTool(TOOLS.signature);
            setStatus("Signature saved. Click on a page to place it.");
          }}
        />

        <button
          type="button"
          className="export-button"
          disabled={!pdfDoc || isExporting}
          onClick={exportPdf}
        >
          {isExporting ? "Exporting..." : "Download filled PDF"}
        </button>
      </aside>

      <main className="workspace">
        {pages.length === 0 ? (
          <section className="empty-state">
            <h2>Your PDF will appear here.</h2>
            <p>
              Start by loading a visa form, contract, or application PDF. Then choose a tool and
              click directly where you want to type, sign, or draw.
            </p>
          </section>
        ) : (
          pages.map((pageInfo) => (
            <section key={pageInfo.pageNumber} className="page-card">
              <div className="page-card__meta">
                <span>Page {pageInfo.pageNumber}</span>
                <span>
                  {Math.round(pageInfo.width)} x {Math.round(pageInfo.height)}
                </span>
              </div>
              <div
                className="page-stage"
                style={{ width: `${pageInfo.width}px`, height: `${pageInfo.height}px` }}
              >
                <canvas ref={(node) => (pageCanvasRefs.current[pageInfo.pageNumber] = node)} />
                {renderPageOverlay(pageInfo)}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}

export default App;
