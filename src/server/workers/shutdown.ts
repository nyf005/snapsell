/** Une erreur fatale doit rester fatale même si SIGTERM arrive pendant le nettoyage. */
export function createShutdownHandler(deps: {
  stop: () => Promise<unknown>;
  exit: (code: number) => void;
  onError: (error: unknown) => void;
  timeoutMs?: number;
}) {
  let exitCode = 0;
  let stopping: Promise<void> | undefined;
  return (fatal = false): Promise<void> => {
    if (fatal) exitCode = 1;
    if (!stopping) {
      stopping = (async () => {
        const deadline = setTimeout(() => deps.exit(1), deps.timeoutMs ?? 35_000);
        try {
          await deps.stop();
        } catch (error) {
          exitCode = 1;
          deps.onError(error);
        } finally {
          clearTimeout(deadline);
          deps.exit(exitCode);
        }
      })();
    }
    return stopping;
  };
}
