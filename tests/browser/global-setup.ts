import { startRecording } from './record';

/**
 * Clears the measurements file once, before any browser test file runs.
 *
 * It used to be cleared in one file's `beforeAll`. Files run in their own
 * order, and that file ran after the journeys file - so the journey's own
 * measurement was written, then deleted, and the run reported no record of
 * whether the payment submission had been exercised.
 *
 * A per-file reset cannot express "once per run". This can.
 */
export default function setup(): void {
  startRecording();
}
