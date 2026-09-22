/**
 * What a reader sees while a route streams.
 *
 * It reserves height rather than collapsing to one line of text. The previous
 * version was a single "Loading..." card about 80px tall; when the real page
 * replaced it, everything below moved by the difference and the browser
 * recorded a layout shift of 0.0933 - 93% of the 0.1 budget, from one swap.
 *
 * That shift only appeared when the fallback had time to paint, so it showed up
 * under load and vanished when measured on its own. A budget passing at 93% and
 * failing whenever the machine is busy is not a passing budget; it is a failure
 * waiting for a slower day.
 *
 * `min-height` cannot match the real content exactly, because the content
 * varies. It does not need to: the shift is scored on how far things move, and
 * reserving most of the viewport removes nearly all of the distance.
 */
export default function Loading() {
  return (
    <div className="vw-card vw-loading" role="status" aria-live="polite">
      <p>Loading...</p>
    </div>
  );
}
