/**
 * Speech to text with the browser's own recognizer (the Web Speech API): free and keyless, in
 * Chrome, Edge and Safari. One utterance per `start()`: it ends when the speaker pauses.
 */
interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

const Ctor: (new () => Recognition) | undefined =
  typeof window === "undefined" ? undefined : ((window as unknown as Record<string, new () => Recognition>).SpeechRecognition ?? (window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition);

export const listeningSupported = !!Ctor;

export interface ListenHandlers {
  /** the words heard so far (not final) */
  onInterim(text: string): void;
  /** the utterance is over: its text, or "" if nothing was heard */
  onDone(text: string): void;
  onError(code: string): void;
}

export class Listener {
  private rec: Recognition | null = null;

  constructor(private h: ListenHandlers) {}

  get active(): boolean {
    return this.rec !== null;
  }

  start(): void {
    if (!Ctor || this.rec) return;
    const rec = new Ctor();
    this.rec = rec;
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "", interim = "";
    rec.onresult = (e) => {
      interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      this.h.onInterim((finalText + interim).trim());
    };
    rec.onerror = (e) => {
      // "no-speech" and "aborted" are a quiet end, not a failure
      if (e.error !== "no-speech" && e.error !== "aborted") this.h.onError(e.error);
    };
    rec.onend = () => {
      if (this.rec !== rec) return; // cancelled
      this.rec = null;
      this.h.onDone((finalText || interim).trim());
    };
    try {
      rec.start();
    } catch (e) {
      this.rec = null;
      this.h.onError(String(e));
    }
  }

  /** Stop listening and send what was heard. */
  finish(): void {
    this.rec?.stop();
  }

  /** Stop listening and discard what was heard. */
  cancel(): void {
    const rec = this.rec;
    this.rec = null;
    rec?.abort();
  }
}
