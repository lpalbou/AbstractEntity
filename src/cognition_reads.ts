/** Shared in-flight text reads. Detaching a viewer must not cancel a result a later viewer needs. */
export class ScoringReads<T> {
  private readonly cache = new Map<string, T>();
  private readonly pending = new Map<string, Promise<T>>();

  get(text: string): T | undefined { return this.cache.get(text); }

  subscribe(text: string, load: () => Promise<T>, receive: (value: T) => void, failed: (error: unknown) => void): () => void {
    let active = true;
    let request = this.pending.get(text);
    if (!request) {
      request = this.cache.has(text) ? Promise.resolve(this.cache.get(text)!) : Promise.resolve().then(load);
      this.pending.set(text, request);
      void request.then((value) => {
        this.cache.set(text, value);
        this.pending.delete(text);
      }, () => { this.pending.delete(text); });
    }
    void request.then((value) => { if (active) receive(value); }, (error) => { if (active) failed(error); });
    return () => { active = false; };
  }
}
