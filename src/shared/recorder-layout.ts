// WHERE THE PRESENTER SITS ON THE RECORDING.
//
// Split out of the recorder because the media stack cannot be tested in Node —
// there is no getDisplayMedia, no MediaRecorder and no canvas — while every
// decision that can actually be WRONG is arithmetic:
//
//   • the presenter must stay inside the frame no matter where it is dragged,
//   • it must keep the camera's aspect ratio rather than being squashed into a
//     square, and
//   • a corner preset must be a real corner at any canvas size.
//
// Get those wrong and the failure is silent: the recording finishes, the file
// downloads, and the presenter is half off the edge or stretched. Nobody finds
// out until it is in front of an audience.

export type PresenterSize = "small" | "medium" | "large";
export type PresenterShape = "circle" | "rounded";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** The presenter's top-left, as a fraction of the canvas. Survives a resolution change. */
export type Placement = { x: number; y: number };

/** Width of the presenter as a fraction of the canvas width. */
export const SIZE_FRACTION: Record<PresenterSize, number> = {
  small: 0.14,
  medium: 0.20,
  large: 0.28,
};

/** Gap between the presenter and the edge when snapped to a corner. */
export const CORNER_MARGIN = 0.025;

export type Rect = { x: number; y: number; w: number; h: number };

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/**
 * The presenter box in canvas pixels.
 *
 * ALWAYS CLAMPED INSIDE THE CANVAS. A drag that would put it past the edge puts
 * it against the edge instead — an overlay that can leave the frame is a
 * recording somebody finds ruined afterwards, and there is no undo on a take.
 */
export function presenterRect(input: {
  canvasW: number; canvasH: number;
  camW: number; camH: number;
  size: PresenterSize;
  placement: Placement;
}): Rect {
  const { canvasW, canvasH, camW, camH, size, placement } = input;
  if (canvasW <= 0 || canvasH <= 0) return { x: 0, y: 0, w: 0, h: 0 };

  const w = Math.round(canvasW * SIZE_FRACTION[size]);
  // The box takes the camera's own proportions. Forcing 4:3 or a square is what
  // produces the stretched face; the CROP (below) is what makes a circle work.
  const aspect = camW > 0 && camH > 0 ? camH / camW : 3 / 4;
  const h = Math.round(w * aspect);

  const maxX = Math.max(0, canvasW - w);
  const maxY = Math.max(0, canvasH - h);
  return {
    x: Math.round(clamp(placement.x * canvasW, 0, maxX)),
    y: Math.round(clamp(placement.y * canvasH, 0, maxY)),
    w, h,
  };
}

/**
 * The placement that puts the presenter in a given corner.
 *
 * Computed from the box's own size rather than a fixed offset, so "bottom right"
 * is the bottom right for a small presenter and a large one alike.
 */
export function cornerPlacement(input: {
  corner: Corner; canvasW: number; canvasH: number; camW: number; camH: number; size: PresenterSize;
}): Placement {
  const { corner, canvasW, canvasH, camW, camH, size } = input;
  const probe = presenterRect({ canvasW, canvasH, camW, camH, size, placement: { x: 0, y: 0 } });
  const wFrac = canvasW > 0 ? probe.w / canvasW : 0;
  const hFrac = canvasH > 0 ? probe.h / canvasH : 0;
  const right = Math.max(0, 1 - wFrac - CORNER_MARGIN);
  const bottom = Math.max(0, 1 - hFrac - CORNER_MARGIN);
  switch (corner) {
    case "top-left": return { x: CORNER_MARGIN, y: CORNER_MARGIN };
    case "top-right": return { x: right, y: CORNER_MARGIN };
    case "bottom-left": return { x: CORNER_MARGIN, y: bottom };
    case "bottom-right": return { x: right, y: bottom };
  }
}

/**
 * The source rectangle to draw so the camera FILLS the box without distortion.
 *
 * Standard cover-crop: the overflowing axis is trimmed equally from both sides,
 * so a 16:9 webcam in a circular frame is centred rather than squeezed.
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return { x: 0, y: 0, w: Math.max(0, srcW), h: Math.max(0, srcH) };
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  if (srcAspect > dstAspect) {
    // Source is wider: trim the sides.
    const w = srcH * dstAspect;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  // Source is taller: trim top and bottom.
  const h = srcW / dstAspect;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

/**
 * Turn a pointer position on the preview into a placement.
 *
 * `grabX/grabY` are where inside the box the drag started, so the presenter does
 * not jump its own top-left corner to the cursor the moment it is touched.
 * Everything is normalised to 0..1 before clamping, which is what lets a drag on
 * a 480px-wide preview place the presenter correctly on a 1920px recording.
 */
export function placementFromDrag(input: {
  pointerX: number; pointerY: number;
  previewW: number; previewH: number;
  boxW: number; boxH: number;
  grabX: number; grabY: number;
}): Placement {
  const { pointerX, pointerY, previewW, previewH, boxW, boxH, grabX, grabY } = input;
  if (previewW <= 0 || previewH <= 0) return { x: 0, y: 0 };
  const left = pointerX - grabX;
  const top = pointerY - grabY;
  return {
    x: clamp(left / previewW, 0, Math.max(0, (previewW - boxW) / previewW)),
    y: clamp(top / previewH, 0, Math.max(0, (previewH - boxH) / previewH)),
  };
}

/** Which corner a placement is nearest — so the preset buttons can show the active one. */
export function nearestCorner(p: Placement): Corner {
  const left = p.x + 0.0001 < 0.5;
  const top = p.y + 0.0001 < 0.5;
  return `${top ? "top" : "bottom"}-${left ? "left" : "right"}` as Corner;
}

/**
 * The canvas the recording is composited onto.
 *
 * Capped, and both dimensions are made EVEN. An odd width breaks the 4:2:0
 * chroma subsampling every H.264/VP9 encoder uses, and the symptom is a green
 * or shifted final column rather than an error — the sort of fault that is only
 * seen after the take.
 */
export function captureSize(screenW: number, screenH: number, maxW = 1920): { w: number; h: number } {
  const sw = Math.max(2, Math.round(screenW || 1280));
  const sh = Math.max(2, Math.round(screenH || 720));
  const scale = sw > maxW ? maxW / sw : 1;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return { w: even(sw * scale), h: even(sh * scale) };
}
