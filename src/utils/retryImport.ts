/**
 * Retry dynamic imports up to N times with exponential backoff
 * Useful for handling transient network errors when loading code-split chunks
 */

interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
}

export function retryImport<T>(
  importFn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 3, delay = 1000, backoff = 1.5 } = options;

  return new Promise((resolve, reject) => {
    const attempt = (retriesLeft: number, currentDelay: number) => {
      importFn()
        .then(resolve)
        .catch((error) => {
          if (retriesLeft === 0) {
            console.error('❌ Failed to load chunk after all retries:', error);
            reject(error);
            return;
          }

          console.warn(
            `⚠️ Failed to load chunk, retrying... (${retriesLeft} attempts left)`,
            error
          );

          setTimeout(() => {
            attempt(retriesLeft - 1, currentDelay * backoff);
          }, currentDelay);
        });
    };

    attempt(retries, delay);
  });
}
