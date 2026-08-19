import { PluginCommAPI, PluginFileAPI, PluginNoteAPI } from 'sn-plugin-lib';

type ApiResponse<T> = {
  success?: boolean;
  result?: T;
  error?: { message?: string };
};

type LassoElement = {
  type?: number;
  stroke?: unknown;
};

type LassoTextBox = {
  textContentFull?: string;
};

/**
 * The native recognizer keeps a stroke buffer that survives across calls AND
 * across plugin sessions, so a second recognition returns the previous words
 * plus the new ones plus noise. cancelRecognize() clears it but needs time to
 * settle — calling recognizeElements() immediately after fails, and can lock
 * up the document. 300ms is the proven floor; 400ms leaves headroom.
 */
const RECOGNIZER_SETTLE_MS = 400;

/** Fallback page size (Nomad); only used when getPageSize is unavailable. */
const FALLBACK_PAGE_SIZE = { width: 1404, height: 1872 };

function unwrap<T>(response: unknown, fallback: T): T {
  const typed = response as ApiResponse<T> | null | undefined;
  if (!typed?.success) return fallback;
  return typed.result ?? fallback;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(() => resolve(undefined), ms));

/**
 * Caps how long a native call may block. getLassoText in particular has
 * nothing to return for handwriting, and waiting on it dominated the delay
 * before the creation modal appeared.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    delay(ms).then(() => fallback),
  ]) as Promise<T>;
}

const TYPED_TEXT_TIMEOUT_MS = 1500;
const CONTEXT_TIMEOUT_MS = 2000;
const RECOGNIZE_TIMEOUT_MS = 15000;

export interface LassoCaptureResult {
  text: string;
  /** 'typed' needs no correction; 'ocr' is fallible and must stay editable. */
  source: 'typed' | 'ocr' | 'none';
  notePath?: string;
  pageNum?: number;
}

/**
 * Reads whatever the user has lassoed in a .note.
 *
 * Typed text boxes are tried first via getLassoText — that returns the exact
 * characters with no recognition involved. Handwriting has no such shortcut and
 * must go through the stroke recognizer.
 */
export async function captureLassoText(): Promise<LassoCaptureResult> {
  // 1. Typed text boxes — exact, no OCR error, so always prefer them. Capped
  //    tightly: on handwriting this has nothing to return, and blocking on it
  //    was pure latency before the modal could open.
  const boxes = await withTimeout(
    PluginNoteAPI.getLassoText().then(res => unwrap<LassoTextBox[]>(res, [])),
    TYPED_TEXT_TIMEOUT_MS,
    [] as LassoTextBox[]
  );

  const typed = boxes
    .map(b => (b?.textContentFull || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  if (typed) {
    return { text: typed, source: 'typed' };
  }

  // 2. Handwriting — recognize the lassoed strokes. Gather the context in
  //    parallel; these are independent reads and were previously serial.
  try {
    const [notePath, pageNum, rawElements] = await Promise.all([
      withTimeout(
        PluginCommAPI.getCurrentFilePath().then(r => unwrap<string | undefined>(r, undefined)),
        CONTEXT_TIMEOUT_MS,
        undefined
      ),
      withTimeout(
        PluginCommAPI.getCurrentPageNum().then(r => unwrap<number | undefined>(r, undefined)),
        CONTEXT_TIMEOUT_MS,
        undefined
      ),
      withTimeout(
        PluginCommAPI.getLassoElements().then(r => unwrap<LassoElement[]>(r, [])),
        CONTEXT_TIMEOUT_MS,
        [] as LassoElement[]
      ),
    ]);

    const elements = rawElements.filter(el => el.type === 0 || el.stroke);
    if (elements.length === 0) {
      return { text: '', source: 'none', notePath, pageNum };
    }

    const size =
      notePath && typeof pageNum === 'number'
        ? await withTimeout(
            PluginFileAPI.getPageSize(notePath, pageNum).then(r =>
              unwrap<{ width: number; height: number }>(r, FALLBACK_PAGE_SIZE)
            ),
            CONTEXT_TIMEOUT_MS,
            FALLBACK_PAGE_SIZE
          )
        : FALLBACK_PAGE_SIZE;

    // Flush the accumulating recognizer buffer, then let it settle. Without
    // this, a second recognition returns the previous words plus noise.
    await withTimeout(PluginCommAPI.cancelRecognize() as Promise<unknown>, CONTEXT_TIMEOUT_MS, null);
    await delay(RECOGNIZER_SETTLE_MS);

    const recognized = (
      await withTimeout(
        PluginCommAPI.recognizeElements(elements, size).then(r => unwrap<string>(r, '')),
        RECOGNIZE_TIMEOUT_MS,
        ''
      )
    ).trim();

    return {
      text: recognized,
      source: recognized ? 'ocr' : 'none',
      notePath,
      pageNum,
    };
  } catch (e) {
    return { text: '', source: 'none' };
  }
}
