export interface InteractionEvent {
  stopPropagation: () => void;
}

export interface RemoveWidgetClickArgs {
  editMode: boolean;
  remove: () => void;
}

export type DashboardWidgetColSpan = 1 | 2 | 3;

export function stopDashboardControlPropagation(event: InteractionEvent): void {
  event.stopPropagation();
}

export function resolveWidgetColSpan(startSpan: DashboardWidgetColSpan, deltaX: number, stepWidth = 180): DashboardWidgetColSpan {
  const nextSpan = startSpan + Math.round(deltaX / stepWidth);

  if (nextSpan <= 1) {
    return 1;
  }

  if (nextSpan >= 3) {
    return 3;
  }

  return nextSpan as DashboardWidgetColSpan;
}

export function handleRemoveWidgetClick(event: InteractionEvent, args: RemoveWidgetClickArgs): void {
  stopDashboardControlPropagation(event);
  if (!args.editMode) {
    return;
  }

  args.remove();
}
