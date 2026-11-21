/**
 * Safe bridging of Node streams into web `Response` bodies.
 *
 * Node's built-in adapter double-closes when a client aborts mid-stream
 * (e.g. video seeking), which surfaces as an uncaught
 * `ERR_INVALID_STATE: ReadableStream is already closed` and can take a
 * server down. This adapter swallows double-close/late errors and
 * destroys the source when the consumer cancels.
 */
import type { Readable } from 'node:stream';

export function toWebStream(src: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      src.on('data', (chunk: Buffer | string) => {
        try {
          controller.enqueue(
            typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk)
          );
        } catch {
          // Consumer is gone — stop the source.
          src.destroy();
        }
      });
      src.on('end', () => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
      src.on('error', (err) => {
        try {
          controller.error(err);
        } catch {
          /* already settled */
        }
      });
    },
    cancel() {
      src.destroy();
    },
  });
}
