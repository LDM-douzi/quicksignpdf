import { useEffect, useRef } from "react";

const LOGICAL_WIDTH = 1080;
const LOGICAL_HEIGHT = 380;
const GUIDE_Y = LOGICAL_HEIGHT * 0.78;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function drawGuide(context) {
  context.save();
  context.strokeStyle = "rgba(148, 163, 184, 0.42)";
  context.lineWidth = 1;
  context.setLineDash([8, 8]);
  context.beginPath();
  context.moveTo(28, GUIDE_Y);
  context.lineTo(LOGICAL_WIDTH - 28, GUIDE_Y);
  context.stroke();
  context.restore();
}

function smoothPoints(points, passes = 3) {
  if (!points?.length || points.length < 3) {
    return points ?? [];
  }

  let nextPoints = points.map((point) => ({ ...point }));

  for (let pass = 0; pass < passes; pass += 1) {
    nextPoints = nextPoints.map((point, index, source) => {
      if (index === 0 || index === source.length - 1) {
        return point;
      }

      const previous = source[index - 1];
      const current = source[index];
      const upcoming = source[index + 1];

      return {
        x: previous.x * 0.18 + current.x * 0.64 + upcoming.x * 0.18,
        y: previous.y * 0.18 + current.y * 0.64 + upcoming.y * 0.18,
      };
    });
  }

  return nextPoints;
}

function drawStroke(context, stroke) {
  if (!stroke?.points?.length) {
    return;
  }

  const { color, width } = stroke;
  const points = smoothPoints(stroke.points);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = width;

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
    context.fill();
    context.restore();
    return;
  }

  if (points.length === 2) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    context.lineTo(points[1].x, points[1].y);
    context.stroke();
    context.restore();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const controlPoint1X = current.x + (next.x - previous.x) / 6;
    const controlPoint1Y = current.y + (next.y - previous.y) / 6;
    const controlPoint2X = next.x - (afterNext.x - current.x) / 6;
    const controlPoint2Y = next.y - (afterNext.y - current.y) / 6;
    context.bezierCurveTo(
      controlPoint1X,
      controlPoint1Y,
      controlPoint2X,
      controlPoint2Y,
      next.x,
      next.y,
    );
  }

  context.stroke();
  context.restore();
}

function configureCanvas(canvas, scaleMultiplier = 1) {
  if (!canvas) {
    return null;
  }

  const ratio = (window.devicePixelRatio || 1) * scaleMultiplier;
  canvas.width = LOGICAL_WIDTH * ratio;
  canvas.height = LOGICAL_HEIGHT * ratio;
  const context = canvas.getContext("2d");
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  return context;
}

export default function SignaturePad({
  signatureDraft,
  setSignatureDraft,
  signatureStrokeWidth,
  setSignatureStrokeWidth,
  signatureColor,
  setSignatureColor,
  onUseSignature,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const uploadedImageRef = useRef(null);
  const strokeHistoryRef = useRef([]);
  const currentStrokeRef = useRef(null);
  const lastSyncedDraftRef = useRef("");

  const renderCanvas = (includeGuide = true) => {
    const context = configureCanvas(canvasRef.current);
    if (!context) {
      return;
    }

    context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (includeGuide) {
      drawGuide(context);
    }

    if (uploadedImageRef.current) {
      context.drawImage(uploadedImageRef.current, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }

    strokeHistoryRef.current.forEach((stroke) => drawStroke(context, stroke));

    if (currentStrokeRef.current) {
      drawStroke(context, currentStrokeRef.current);
    }
  };

  const exportSignature = () => {
    const exportCanvas = document.createElement("canvas");
    const context = configureCanvas(exportCanvas, 2);
    if (!context) {
      return "";
    }

    context.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    if (uploadedImageRef.current) {
      context.drawImage(uploadedImageRef.current, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }

    strokeHistoryRef.current.forEach((stroke) => drawStroke(context, stroke));
    return exportCanvas.toDataURL("image/png");
  };

  const syncDraftToParent = () => {
    const hasSignature =
      Boolean(uploadedImageRef.current) || strokeHistoryRef.current.some((stroke) => stroke.points.length);

    if (!hasSignature) {
      lastSyncedDraftRef.current = "";
      setSignatureDraft("");
      return;
    }

    const nextDraft = exportSignature();
    lastSyncedDraftRef.current = nextDraft;
    setSignatureDraft(nextDraft);
  };

  useEffect(() => {
    if (!signatureDraft) {
      if (!lastSyncedDraftRef.current) {
        uploadedImageRef.current = null;
        strokeHistoryRef.current = [];
        currentStrokeRef.current = null;
      }
      renderCanvas();
      return;
    }

    if (signatureDraft === lastSyncedDraftRef.current) {
      renderCanvas();
      return;
    }

    const image = new Image();
    image.onload = () => {
      uploadedImageRef.current = image;
      strokeHistoryRef.current = [];
      currentStrokeRef.current = null;
      lastSyncedDraftRef.current = signatureDraft;
      renderCanvas();
    };
    image.src = signatureDraft;
  }, [signatureDraft]);

  useEffect(() => {
    if (strokeHistoryRef.current.length) {
      strokeHistoryRef.current = strokeHistoryRef.current.map((stroke) => ({
        ...stroke,
        width: signatureStrokeWidth,
      }));
      syncDraftToParent();
    }

    if (currentStrokeRef.current) {
      currentStrokeRef.current = {
        ...currentStrokeRef.current,
        width: signatureStrokeWidth,
      };
    }

    renderCanvas();
  }, [signatureStrokeWidth]);

  useEffect(() => {
    if (strokeHistoryRef.current.length) {
      strokeHistoryRef.current = strokeHistoryRef.current.map((stroke) => ({
        ...stroke,
        color: signatureColor,
      }));
      syncDraftToParent();
    }

    if (currentStrokeRef.current) {
      currentStrokeRef.current = {
        ...currentStrokeRef.current,
        color: signatureColor,
      };
    }

    renderCanvas();
  }, [signatureColor]);

  const pointFromEvent = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
    };
  };

  const startDrawing = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    currentStrokeRef.current = {
      width: signatureStrokeWidth,
      color: signatureColor,
      points: [pointFromEvent(event)],
    };
    renderCanvas();
  };

  const draw = (event) => {
    if (!drawingRef.current || !currentStrokeRef.current) {
      return;
    }

    const point = pointFromEvent(event);
    const lastPoint =
      currentStrokeRef.current.points[currentStrokeRef.current.points.length - 1] ?? point;
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);

    if (distance < 0.35) {
      return;
    }

    const smoothing = 0.38;
    currentStrokeRef.current = {
      ...currentStrokeRef.current,
      points: [
        ...currentStrokeRef.current.points,
        {
          x: lastPoint.x + (point.x - lastPoint.x) * smoothing,
          y: lastPoint.y + (point.y - lastPoint.y) * smoothing,
        },
      ],
    };
    renderCanvas();
  };

  const stopDrawing = (event) => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (!currentStrokeRef.current?.points?.length) {
      currentStrokeRef.current = null;
      renderCanvas();
      return;
    }

    strokeHistoryRef.current = [...strokeHistoryRef.current, currentStrokeRef.current];
    currentStrokeRef.current = null;
    renderCanvas();
    syncDraftToParent();
  };

  const clearSignature = () => {
    uploadedImageRef.current = null;
    strokeHistoryRef.current = [];
    currentStrokeRef.current = null;
    lastSyncedDraftRef.current = "";
    renderCanvas();
    setSignatureDraft("");
  };

  const onUploadSignature = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const nextDataUrl = await fileToDataUrl(file);
    const image = new Image();
    image.onload = () => {
      uploadedImageRef.current = image;
      strokeHistoryRef.current = [];
      currentStrokeRef.current = null;
      lastSyncedDraftRef.current = nextDataUrl;
      renderCanvas();
      setSignatureDraft(nextDataUrl);
    };
    image.src = nextDataUrl;
  };

  const handleUseSignature = () => {
    const nextDraft = exportSignature();
    if (!nextDraft) {
      return;
    }

    lastSyncedDraftRef.current = nextDraft;
    setSignatureDraft(nextDraft);
    onUseSignature(nextDraft);
  };

  const hasSignature =
    Boolean(signatureDraft) ||
    Boolean(uploadedImageRef.current) ||
    strokeHistoryRef.current.some((stroke) => stroke.points.length);

  return (
    <section className="panel surface-panel">
      <div className="panel-heading">
        <h3>Signature</h3>
      </div>

      <div className="signature-shell">
        <canvas
          ref={canvasRef}
          className="signature-pad"
          width={LOGICAL_WIDTH}
          height={LOGICAL_HEIGHT}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerLeave={stopDrawing}
        />
      </div>

      <label className="field">
        <span>Ink color</span>
        <input
          type="color"
          value={signatureColor}
          onChange={(event) => setSignatureColor(event.target.value)}
        />
      </label>

      <label className="field">
        <div className="range-label">
          <span>Pen thickness</span>
          <strong>{signatureStrokeWidth.toFixed(1)} px</strong>
        </div>
        <input
          type="range"
          min="1.2"
          max="14"
          step="0.2"
          value={signatureStrokeWidth}
          onChange={(event) => setSignatureStrokeWidth(Number(event.target.value))}
        />
        <div className="range-foot">
          <span>Finer</span>
          <span>Bolder</span>
        </div>
      </label>

      <div className="control-row">
        <label className="ghost-button">
          Upload PNG
          <input type="file" accept="image/png" hidden onChange={onUploadSignature} />
        </label>
        <button type="button" className="ghost-button" onClick={clearSignature}>
          Clear
        </button>
      </div>

      <button
        type="button"
        className="primary-button wide-button"
        onClick={handleUseSignature}
        disabled={!hasSignature}
      >
        Use signature
      </button>
    </section>
  );
}
