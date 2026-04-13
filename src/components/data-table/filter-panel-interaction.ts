export function toggleOpenColumnId(currentColumnId: string | null, columnId: string): string | null {
  return currentColumnId === columnId ? null : columnId;
}

export function requestCloseColumnId(currentColumnId: string | null, columnId: string): string | null {
  return currentColumnId === columnId ? null : currentColumnId;
}

export function isWithinFilterPanelBoundary(
  target: Node | null,
  panelElement: Pick<HTMLElement, "contains"> | null,
  anchorElement: Pick<HTMLElement, "contains"> | null,
): boolean {
  if (!target) {
    return false;
  }

  return Boolean(panelElement?.contains(target) || anchorElement?.contains(target));
}
