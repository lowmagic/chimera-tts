/**
 * Cuts a streaming reply into sentences as they complete, so the voice can start on the first one
 * while the model is still writing the rest.
 */
const NOT_AN_END = /(?:\b(?:Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e|approx|No)|\b[A-Z])\.$/;
/** a sentence shorter than this waits for the next one ("Sure." + "Here you go.") */
const MIN_CHARS = 24;

export class SentenceStream {
  private buf = "";

  /** Add streamed text; returns the sentences it completed. */
  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];
    let from = 0;
    const re = /[.!?]+["')\]]*(?=\s)|\n+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buf))) {
      const end = m.index + m[0].length;
      const piece = this.buf.slice(from, end);
      const newline = m[0].startsWith("\n");
      if (!newline && (NOT_AN_END.test(piece) || piece.trim().length < MIN_CHARS)) continue;
      if (piece.trim()) out.push(piece.trim());
      from = end;
    }
    this.buf = this.buf.slice(from);
    return out;
  }

  /** The reply is over: whatever is left is the last sentence. */
  flush(): string[] {
    const rest = this.buf.trim();
    this.buf = "";
    return rest ? [rest] : [];
  }
}
