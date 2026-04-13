export interface PanelRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

export interface PanelPositionInput {
  anchorRect: PanelRect;
  panelRect: Pick<PanelRect, "height" | "width">;
  viewportHeight: number;
  viewportWidth: number;
  gap?: number;
  padding?: number;
}

export interface PanelPosition {
  left: number;
  top: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

export function resolvePanelPosition({
  anchorRect,
  panelRect,
  viewportHeight,
  viewportWidth,
  gap = 8,
  padding = 12,
}: PanelPositionInput): PanelPosition {
  const maxLeft = Math.max(padding, viewportWidth - panelRect.width - padding);
  const preferredLeft = anchorRect.right - panelRect.width;
  const left = clamp(preferredLeft, padding, maxLeft);

  const belowTop = anchorRect.bottom + gap;
  const aboveTop = anchorRect.top - panelRect.height - gap;
  const maxTop = Math.max(padding, viewportHeight - panelRect.height - padding);

  let top = belowTop;
  if (belowTop + panelRect.height > viewportHeight - padding && aboveTop >= padding) {
    top = aboveTop;
  }

  return {
    left,
    top: clamp(top, padding, maxTop),
  };
}
