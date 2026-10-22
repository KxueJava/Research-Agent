export const PREVIEW_LOAD_TIMEOUT_MS = 10_000;

/** iframe navigation does not reliably emit error (including failed HTTP loads).
 * Bound the wait, retry one fresh browsing context, and allow explicit recovery.
 */
export function createPreviewLoadGuard(retry: () => void, timeout: () => void) {
  let stopped = false;
  let retried = false;
  let timer: ReturnType<typeof setTimeout>;
  const arm = () => {
    timer = setTimeout(() => {
      if (stopped) return;
      if (!retried) {
        retried = true;
        retry();
        arm();
      } else {
        stopped = true;
        timeout();
      }
    }, PREVIEW_LOAD_TIMEOUT_MS);
  };
  const finish = () => {
    stopped = true;
    clearTimeout(timer);
  };
  arm();
  return { finish, dispose: finish };
}
