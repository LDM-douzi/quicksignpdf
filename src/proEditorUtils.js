export const TOOLS = {
  select: "select",
  text: "text",
  signature: "signature",
  highlight: "highlight",
  redact: "redact",
  image: "image",
  arrow: "arrow",
  draw: "draw",
  cross: "cross",
  check: "check",
  sticky: "sticky",
  erase: "erase",
  search: "search",
  date: "date",
};

export const TOOLBAR_GROUPS = [
  { id: TOOLS.select, label: "Selection", icon: "cursor" },
  { id: TOOLS.text, label: "Text", icon: "text" },
  { id: TOOLS.signature, label: "Sign", icon: "sign" },
  { id: TOOLS.highlight, label: "Highlight", icon: "highlight" },
  { id: TOOLS.redact, label: "Redact", icon: "redact" },
  { id: TOOLS.draw, label: "Draw", icon: "draw" },
  { id: TOOLS.image, label: "Image", icon: "image" },
  { id: TOOLS.check, label: "Check", icon: "check" },
  { id: TOOLS.cross, label: "Cross", icon: "cross" },
  { id: TOOLS.sticky, label: "Sticky", icon: "sticky" },
  { id: TOOLS.date, label: "Date", icon: "date" },
  { id: TOOLS.erase, label: "Erase", icon: "erase" },
  { id: TOOLS.search, label: "Search", icon: "search" },
];

export const FONT_OPTIONS = [
  { value: '"Segoe UI", Arial, sans-serif', label: "Sans" },
  { value: 'Georgia, "Times New Roman", serif', label: "Serif" },
  { value: '"Courier New", monospace', label: "Mono" },
  { value: '"Trebuchet MS", Arial, sans-serif', label: "Modern" },
];

export const DEFAULT_TEXT_PRESET = {
  value: "Type here",
  color: "#111827",
  fontSize: 0.024,
  fontFamily: FONT_OPTIONS[0].value,
};

export const DEFAULT_STROKE_PRESET = {
  color: "#2563eb",
  width: 0.004,
};

export const DEFAULT_HIGHLIGHT_PRESET = {
  color: "#fde047",
  width: 0.02,
  opacity: 0.35,
};

export const DEFAULT_REDACT_PRESET = {
  color: "#111827",
};

export const DEFAULT_NOTE_PRESET = {
  title: "Sticky note",
  body: "Add a comment",
  color: "#fff4b8",
};

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function smoothStrokePoints(points, passes = 2) {
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
        x: previous.x * 0.2 + current.x * 0.6 + upcoming.x * 0.2,
        y: previous.y * 0.2 + current.y * 0.6 + upcoming.y * 0.2,
      };
    });
  }

  return nextPoints;
}

export function getSmoothStrokePath(points) {
  const smoothPoints = smoothStrokePoints(points);

  if (!smoothPoints.length) {
    return "";
  }

  if (smoothPoints.length === 1) {
    return `M ${smoothPoints[0].x} ${smoothPoints[0].y}`;
  }

  if (smoothPoints.length === 2) {
    return `M ${smoothPoints[0].x} ${smoothPoints[0].y} L ${smoothPoints[1].x} ${smoothPoints[1].y}`;
  }

  let path = `M ${smoothPoints[0].x} ${smoothPoints[0].y}`;

  for (let index = 0; index < smoothPoints.length - 1; index += 1) {
    const previous = smoothPoints[index - 1] ?? smoothPoints[index];
    const current = smoothPoints[index];
    const next = smoothPoints[index + 1];
    const afterNext = smoothPoints[index + 2] ?? next;
    const controlPoint1X = current.x + (next.x - previous.x) / 6;
    const controlPoint1Y = current.y + (next.y - previous.y) / 6;
    const controlPoint2X = next.x - (afterNext.x - current.x) / 6;
    const controlPoint2Y = next.y - (afterNext.y - current.y) / 6;

    path += ` C ${controlPoint1X} ${controlPoint1Y}, ${controlPoint2X} ${controlPoint2Y}, ${next.x} ${next.y}`;
  }

  return path;
}

export function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function cloneBytes(bytes) {
  return new Uint8Array(bytes);
}

export function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function formatToday() {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function createTextAnnotation(pageNumber, x, y, preset, valueOverride) {
  return {
    id: uid("text"),
    type: "text",
    pageNumber,
    x,
    y,
    text: valueOverride ?? preset.value,
    color: preset.color,
    fontSize: preset.fontSize,
    fontFamily: preset.fontFamily,
  };
}

export function createSymbolAnnotation(pageNumber, x, y, symbol, color) {
  return {
    id: uid("symbol"),
    type: "symbol",
    pageNumber,
    x,
    y,
    text: symbol,
    color,
    fontSize: 0.038,
    fontFamily: FONT_OPTIONS[0].value,
  };
}

export function createSignatureAnnotation(pageNumber, x, y, image) {
  return {
    id: uid("signature"),
    type: "signature",
    pageNumber,
    x,
    y,
    width: 0.24,
    height: 0.09,
    image,
  };
}

export function createImageAnnotation(pageNumber, x, y, image) {
  return {
    id: uid("image"),
    type: "image",
    pageNumber,
    x,
    y,
    width: 0.22,
    height: 0.18,
    image,
  };
}

export function createNoteAnnotation(pageNumber, x, y, preset) {
  return {
    id: uid("note"),
    type: "sticky",
    pageNumber,
    x,
    y,
    width: 0.2,
    height: 0.16,
    title: preset.title,
    body: preset.body,
    color: preset.color,
  };
}

export function createStrokeAnnotation(pageNumber, x, y, preset, type) {
  return {
    id: uid(type),
    type,
    pageNumber,
    color: preset.color,
    strokeWidth: preset.width,
    opacity: type === "highlight" ? preset.opacity : 1,
    points: [{ x, y }],
  };
}

export function createArrowAnnotation(pageNumber, x, y, color, strokeWidth) {
  return {
    id: uid("arrow"),
    type: "arrow",
    pageNumber,
    color,
    strokeWidth,
    x1: x,
    y1: y,
    x2: x,
    y2: y,
  };
}

export function createRedactAnnotation(pageNumber, x, y, color) {
  return {
    id: uid("redact"),
    type: "redact",
    pageNumber,
    color,
    x,
    y,
    width: 0.001,
    height: 0.001,
  };
}

export function annotationLabel(annotation) {
  if (!annotation) {
    return "Nothing selected";
  }

  const labels = {
    text: "Text",
    symbol: "Mark",
    signature: "Signature",
    image: "Image",
    sticky: "Sticky note",
    draw: "Drawing",
    highlight: "Highlight",
    arrow: "Arrow",
    redact: "Redaction",
  };

  return labels[annotation.type] ?? annotation.type;
}

export function duplicateAnnotation(annotation) {
  const next = structuredClone(annotation);
  next.id = uid(annotation.type);

  if ("x" in next) {
    next.x = clamp(next.x + 0.02, 0, 0.9);
  }
  if ("y" in next) {
    next.y = clamp(next.y + 0.02, 0, 0.9);
  }
  if ("x1" in next) {
    next.x1 = clamp(next.x1 + 0.02, 0, 1);
    next.x2 = clamp(next.x2 + 0.02, 0, 1);
    next.y1 = clamp(next.y1 + 0.02, 0, 1);
    next.y2 = clamp(next.y2 + 0.02, 0, 1);
  }
  if (next.points) {
    next.points = next.points.map((point) => ({
      x: clamp(point.x + 0.02, 0, 1),
      y: clamp(point.y + 0.02, 0, 1),
    }));
  }

  return next;
}

export function getAnnotationBounds(annotation) {
  if (annotation.type === "text" || annotation.type === "symbol") {
    return {
      x: annotation.x,
      y: annotation.y,
      width: 0.18,
      height: Math.max(0.04, annotation.fontSize * 1.6),
    };
  }

  if (
    annotation.type === "signature" ||
    annotation.type === "image" ||
    annotation.type === "sticky" ||
    annotation.type === "redact"
  ) {
    return {
      x: annotation.x,
      y: annotation.y,
      width: annotation.width,
      height: annotation.height,
    };
  }

  if (annotation.type === "arrow") {
    const left = Math.min(annotation.x1, annotation.x2);
    const top = Math.min(annotation.y1, annotation.y2);
    return {
      x: left,
      y: top,
      width: Math.abs(annotation.x2 - annotation.x1),
      height: Math.abs(annotation.y2 - annotation.y1),
    };
  }

  if (annotation.points?.length) {
    const xs = annotation.points.map((point) => point.x);
    const ys = annotation.points.map((point) => point.y);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  }

  return { x: 0, y: 0, width: 0, height: 0 };
}

export function hitTestAnnotation(annotation, x, y) {
  const bounds = getAnnotationBounds(annotation);
  const padding = annotation.type === "text" || annotation.type === "symbol" ? 0.02 : 0.012;
  return (
    x >= bounds.x - padding &&
    x <= bounds.x + bounds.width + padding &&
    y >= bounds.y - padding &&
    y <= bounds.y + bounds.height + padding
  );
}

export function moveAnnotation(annotation, deltaX, deltaY) {
  if ("x" in annotation && "y" in annotation) {
    return {
      ...annotation,
      x: clamp(annotation.x + deltaX, 0, 0.98),
      y: clamp(annotation.y + deltaY, 0, 0.98),
    };
  }

  if ("x1" in annotation) {
    return {
      ...annotation,
      x1: clamp(annotation.x1 + deltaX, 0, 1),
      y1: clamp(annotation.y1 + deltaY, 0, 1),
      x2: clamp(annotation.x2 + deltaX, 0, 1),
      y2: clamp(annotation.y2 + deltaY, 0, 1),
    };
  }

  if (annotation.points?.length) {
    return {
      ...annotation,
      points: annotation.points.map((point) => ({
        x: clamp(point.x + deltaX, 0, 1),
        y: clamp(point.y + deltaY, 0, 1),
      })),
    };
  }

  return annotation;
}

export function normalizeRect(startX, startY, endX, endY) {
  const x = Math.min(startX, endX);
  const y = Math.min(startY, endY);
  return {
    x,
    y,
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function wrapTextLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let currentLine = "";

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(nextLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawText(ctx, annotation, width, height) {
  ctx.save();
  ctx.fillStyle = annotation.color;
  ctx.font = `${Math.max(12, annotation.fontSize * height)}px ${annotation.fontFamily}`;
  ctx.textBaseline = "top";
  const x = annotation.x * width;
  const y = annotation.y * height;
  const lines = annotation.text.split("\n");
  const lineHeight = Math.max(16, annotation.fontSize * height * 1.22);
  lines.forEach((line, index) => {
    ctx.fillText(line || " ", x, y + index * lineHeight);
  });
  ctx.restore();
}

function drawStroke(ctx, annotation, width, height) {
  const smoothPoints = smoothStrokePoints(annotation.points);

  if (!smoothPoints?.length) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.globalAlpha = annotation.opacity ?? 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, annotation.strokeWidth * height);

  if (smoothPoints.length === 1) {
    ctx.beginPath();
    ctx.arc(
      smoothPoints[0].x * width,
      smoothPoints[0].y * height,
      Math.max(1, annotation.strokeWidth * height) / 2,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = annotation.color;
    ctx.fill();
    ctx.restore();
    return;
  }

  if (smoothPoints.length === 2) {
    ctx.beginPath();
    ctx.moveTo(smoothPoints[0].x * width, smoothPoints[0].y * height);
    ctx.lineTo(smoothPoints[1].x * width, smoothPoints[1].y * height);
    ctx.stroke();
    ctx.restore();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(smoothPoints[0].x * width, smoothPoints[0].y * height);

  for (let index = 0; index < smoothPoints.length - 1; index += 1) {
    const previous = smoothPoints[index - 1] ?? smoothPoints[index];
    const current = smoothPoints[index];
    const next = smoothPoints[index + 1];
    const afterNext = smoothPoints[index + 2] ?? next;
    const controlPoint1X = (current.x + (next.x - previous.x) / 6) * width;
    const controlPoint1Y = (current.y + (next.y - previous.y) / 6) * height;
    const controlPoint2X = (next.x - (afterNext.x - current.x) / 6) * width;
    const controlPoint2Y = (next.y - (afterNext.y - current.y) / 6) * height;
    ctx.bezierCurveTo(
      controlPoint1X,
      controlPoint1Y,
      controlPoint2X,
      controlPoint2Y,
      next.x * width,
      next.y * height,
    );
  }

  ctx.stroke();
  ctx.restore();
}

function drawArrow(ctx, annotation, width, height) {
  const x1 = annotation.x1 * width;
  const y1 = annotation.y1 * height;
  const x2 = annotation.x2 * width;
  const y2 = annotation.y2 * height;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = Math.max(12, annotation.strokeWidth * height * 6);

  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.fillStyle = annotation.color;
  ctx.lineWidth = Math.max(2, annotation.strokeWidth * height);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRedaction(ctx, annotation, width, height) {
  ctx.save();
  ctx.fillStyle = annotation.color;
  ctx.fillRect(
    annotation.x * width,
    annotation.y * height,
    annotation.width * width,
    annotation.height * height,
  );
  ctx.restore();
}

function drawSticky(ctx, annotation, width, height) {
  const x = annotation.x * width;
  const y = annotation.y * height;
  const boxWidth = annotation.width * width;
  const boxHeight = annotation.height * height;

  ctx.save();
  ctx.fillStyle = annotation.color;
  ctx.fillRect(x, y, boxWidth, boxHeight);
  ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
  ctx.strokeRect(x, y, boxWidth, boxHeight);
  ctx.fillStyle = "#111827";
  ctx.font = `${Math.max(12, height * 0.02)}px "Segoe UI", sans-serif`;
  ctx.fillText(annotation.title, x + 12, y + 10);

  ctx.font = `${Math.max(10, height * 0.017)}px "Segoe UI", sans-serif`;
  const lines = wrapTextLines(ctx, annotation.body, Math.max(40, boxWidth - 24));
  const lineHeight = Math.max(14, height * 0.02);
  lines.slice(0, 6).forEach((line, index) => {
    ctx.fillText(line, x + 12, y + 34 + index * lineHeight);
  });
  ctx.restore();
}

export async function drawAnnotationOnContext(ctx, annotation, width, height) {
  if (annotation.type === "text" || annotation.type === "symbol") {
    drawText(ctx, annotation, width, height);
    return;
  }

  if (annotation.type === "draw" || annotation.type === "highlight") {
    drawStroke(ctx, annotation, width, height);
    return;
  }

  if (annotation.type === "arrow") {
    drawArrow(ctx, annotation, width, height);
    return;
  }

  if (annotation.type === "redact") {
    drawRedaction(ctx, annotation, width, height);
    return;
  }

  if (annotation.type === "sticky") {
    drawSticky(ctx, annotation, width, height);
    return;
  }

  if (
    (annotation.type === "signature" || annotation.type === "image") &&
    annotation.image
  ) {
    const image = await loadImage(annotation.image);
    ctx.drawImage(
      image,
      annotation.x * width,
      annotation.y * height,
      annotation.width * width,
      annotation.height * height,
    );
  }
}
