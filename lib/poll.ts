/** A single completion-scheduled request. Disposal cancels transport and delivery. */
export function startPolling<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  receive: (value: T) => void;
  fail: (error: Error) => void;
  interval: number;
  visible?: () => boolean;
}) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  let failures = 0;
  async function tick() {
    if (stopped) return;
    if (options.visible && !options.visible()) {
      timer = setTimeout(tick, 1000);
      return;
    }
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15_000);
    try {
      const value = await options.load(controller.signal);
      if (!stopped) {
        failures = 0;
        options.receive(value);
      }
    } catch (error) {
      if (!stopped) {
        failures++;
        options.fail(
          error instanceof Error ? error : new Error("Feed unavailable"),
        );
      }
    } finally {
      clearTimeout(timeout);
      if (!stopped)
        timer = setTimeout(
          tick,
          failures
            ? Math.min(120_000, 30_000 * 2 ** (failures - 1))
            : options.interval,
        );
    }
  }
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
  };
}
