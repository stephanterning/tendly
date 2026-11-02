import type { FileUploader, UploadedFile } from './api.js';
export type UploadEntry = {
  id: string; name: string; state: 'queued' | 'uploading' | 'processing' | 'failed' | 'done' | 'unplaced';
  progress: number; error?: string | undefined; result?: UploadedFile;
};
type Job = { file: File; complete: (file: UploadedFile) => boolean; remove: () => void };
export class UploadQueue {
  private entries: UploadEntry[] = [];
  private jobs = new Map<string, Job>();
  private listeners = new Set<() => void>();
  private running = false;
  private disposed = false;
  constructor(private upload: FileUploader) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.entries;
  private emit() { for (const listener of this.listeners) listener(); }
  private update(id: string, patch: Partial<UploadEntry>) {
    this.entries = this.entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
    this.emit();
  }
  add(id: string, file: File, complete: Job['complete'] = () => true, remove: Job['remove'] = () => {}) {
    this.jobs.set(id, { file, complete, remove });
    this.entries = [...this.entries, { id, name: file.name, state: 'queued', progress: 0 }];
    this.emit();
    void this.drain();
  }
  retry(id: string) {
    if (this.entries.find(entry => entry.id === id)?.state !== 'failed') return;
    this.update(id, { state: 'queued', error: undefined, progress: 0 });
    void this.drain();
  }
  remove(id: string) {
    const entry = this.entries.find(item => item.id === id);
    if (!entry || ['uploading', 'processing'].includes(entry.state)) return;
    this.jobs.get(id)?.remove();
    this.jobs.delete(id);
    this.entries = this.entries.filter(item => item.id !== id);
    this.emit();
  }
  placed(id: string) { this.update(id, { state: 'done' }); }
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; this.jobs.clear(); this.listeners.clear(); }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.disposed) {
        const entry = this.entries.find(item => item.state === 'queued');
        if (!entry) break;
        const job = this.jobs.get(entry.id)!;
        this.update(entry.id, { state: 'uploading' });
        try {
          const result = await this.upload(job.file, entry.id, progress => {
            if (!this.disposed) this.update(entry.id, { progress, state: progress === 100 ? 'processing' : 'uploading' });
          });
          if (this.disposed) return;
          const placed = job.complete(result);
          this.update(entry.id, { state: placed ? 'done' : 'unplaced', result, progress: 100 });
          this.jobs.delete(entry.id);
        } catch (error) {
          if (!this.disposed) this.update(entry.id, { state: 'failed', error: error instanceof Error ? error.message : 'operation_failed' });
        }
      }
    } finally { this.running = false; }
  }
}
