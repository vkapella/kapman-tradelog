export interface InteractionEvent {
  stopPropagation: () => void;
}

export interface RemoveWidgetClickArgs {
  editMode: boolean;
  remove: () => void;
}

export function stopDashboardControlPropagation(event: InteractionEvent): void {
  event.stopPropagation();
}

export function handleRemoveWidgetClick(event: InteractionEvent, args: RemoveWidgetClickArgs): void {
  stopDashboardControlPropagation(event);
  if (!args.editMode) {
    return;
  }

  args.remove();
}
