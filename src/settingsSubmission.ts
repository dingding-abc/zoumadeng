export interface DisableableControl { disabled: boolean }

export class SettingsSubmissionState<T> {
  private pending: T | undefined;
  private inFlight = false;

  begin(create: () => T): T {
    if (this.inFlight) throw new Error("设置保存仍在进行");
    this.inFlight = true;
    this.pending ??= create();
    return this.pending;
  }

  finish(saved: boolean): void {
    this.inFlight = false;
    if (saved) this.pending = undefined;
  }

  draftChanged(): void {
    if (!this.inFlight) this.pending = undefined;
  }
}

/** Disable every draft control for one save attempt, then restore its prior state. */
export function lockSettingsControls(controls: Iterable<DisableableControl>): () => void {
  const previous = Array.from(controls, (control) => ({ control, disabled: control.disabled }));
  for (const { control } of previous) control.disabled = true;
  return () => { for (const { control, disabled } of previous) control.disabled = disabled; };
}
