export const TOOLS = {
  select: "select",
  text: "text",
  date: "date",
  signature: "signature",
  draw: "draw",
  highlight: "highlight",
  check: "check",
};

export const TOOL_BUTTONS = [
  { id: TOOLS.select, label: "Select" },
  { id: TOOLS.text, label: "Text" },
  { id: TOOLS.date, label: "Date" },
  { id: TOOLS.signature, label: "Signature" },
  { id: TOOLS.draw, label: "Pen" },
  { id: TOOLS.highlight, label: "Highlight" },
  { id: TOOLS.check, label: "Check" },
];

export const DEFAULT_TEXT = "Type here";
export const DEFAULT_TEXT_COLOR = "#0f172a";
export const DEFAULT_PEN_COLOR = "#1d4ed8";
export const DEFAULT_HIGHLIGHT_COLOR = "#facc15";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
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

export function cloneBytes(bytes) {
  return new Uint8Array(bytes);
}

export function createTextAnnotation(pageNumber, x, y, text, color, fontSize) {
  return {
    id: uid("text"),
    pageNumber,
    type: "text",
    x,
    y,
    text,
    color,
    fontSize,
  };
}

export function createSignatureAnnotation(pageNumber, x, y, image) {
  return {
    id: uid("signature"),
    pageNumber,
    type: "signature",
    x,
    y,
    width: 0.26,
    height: 0.095,
    image,
  };
}

export function createStrokeAnnotation(pageNumber, x, y, color, strokeWidth, mode) {
  return {
    id: uid(mode),
    pageNumber,
    type: mode,
    color,
    strokeWidth,
    opacity: mode === "highlight" ? 0.35 : 1,
    points: [{ x, y }],
  };
}

export function annotationLabel(annotation) {
  if (!annotation) {
    return "Nothing selected";
  }

  if (annotation.type === "signature") {
    return "Signature";
  }

  if (annotation.type === "draw") {
    return "Pen stroke";
  }

  if (annotation.type === "highlight") {
    return "Highlight";
  }

  return annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1);
}

export function duplicateAnnotation(annotation) {
  const next = structuredClone(annotation);
  next.id = uid(annotation.type);
  next.x = clamp((annotation.x ?? 0) + 0.02, 0, 0.92);
  next.y = clamp((annotation.y ?? 0) + 0.02, 0, 0.92);

  if (next.points) {
    next.points = next.points.map((point) => ({
      x: clamp(point.x + 0.02, 0, 1),
      y: clamp(point.y + 0.02, 0, 1),
    }));
  }

  return next;
}

export async function loadImage(src) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function drawText(ctx, annotation, width, height) {
  ctx.save();
  ctx.fillStyle = annotation.color;
  ctx.font = `${Math.max(12, annotation.fontSize * height)}px "Segoe UI", sans-serif`;
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
  if (!annotation.points || annotation.points.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = annotation.color;
  ctx.globalAlpha = annotation.opacity ?? 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, annotation.strokeWidth * height);
  ctx.beginPath();

  annotation.points.forEach((point, index) => {
    const px = point.x * width;
    const py = point.y * height;
    if (index === 0) {
      ctx.moveTo(px, py);
      return;
    }
    ctx.lineTo(px, py);
  });

  ctx.stroke();
  ctx.restore();
}

export async function drawAnnotationOnContext(ctx, annotation, width, height) {
  if (annotation.type === "text") {
    drawText(ctx, annotation, width, height);
    return;
  }

  if (annotation.type === "draw" || annotation.type === "highlight") {
    drawStroke(ctx, annotation, width, height);
    return;
  }

  if (annotation.type === "signature" && annotation.image) {
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
