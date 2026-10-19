/** Adapted from VMark nearViewport.ts/renderQueue.ts @ 449fbc3e0, ISC.
 * Full notice: docs/vmark-port/UPSTREAM-LICENSE.txt.
 * One shared observer/queue per Auris scroll root for formulas and images. */
import { createRenderQueue, distanceToVisible, type RenderQueue } from "./math-render-queue";
type Job = { target: HTMLElement; render: () => void; root: HTMLElement; block: HTMLElement; distance: number; measuredAt: number; queued: boolean; running: boolean };
const schedulers = new WeakMap<HTMLElement, ViewportRenderScheduler>();

class ViewportRenderScheduler {
  private jobs = new Map<HTMLElement, Job>();
  private queue: RenderQueue<Job>;
  private observer: IntersectionObserver;

  constructor(private root: HTMLElement) {
    this.queue = createRenderQueue<Job>({
      marginPx: 1200, budgetMs: 6, maxPerFrame: 8,
      run: (job) => {
        job.running = true;
        this.remove(job);
        if (job.target.isConnected) job.render();
      },
      expire: (job) => { job.queued = false; },
    });
    this.observer = new IntersectionObserver((entries) => {
      const due: Job[] = [];
      for (const entry of entries) {
        const job = this.jobs.get(entry.target as HTMLElement);
        if (!job) continue;
        if (entry.isIntersecting && !job.queued) {
          job.distance = distanceToVisible(job.target.getBoundingClientRect(), this.root.getBoundingClientRect());
          job.measuredAt = this.root.scrollTop;
          job.queued = true;
          due.push(job);
        } else if (!entry.isIntersecting && job.queued) {
          this.queue.remove(job);
          job.queued = false;
        }
      }
      this.queue.add(due);
    }, { root, rootMargin: "1200px 0px" });
  }

  add(target: HTMLElement, render: () => void) {
    const job: Job = { target, render, root: this.root, block: target, distance: 0, measuredAt: this.root.scrollTop, queued: false, running: false };
    this.jobs.set(target, job);
    this.observer.observe(target);
    return () => this.remove(job);
  }

  private remove(job: Job) {
    if (this.jobs.get(job.target) !== job) return;
    if (job.queued && !job.running) this.queue.remove(job);
    this.jobs.delete(job.target);
    this.observer.unobserve(job.target);
    if (!this.jobs.size) {
      this.queue.clear();
      this.observer.disconnect();
      schedulers.delete(this.root);
    }
  }

}

/** Cancelled/deleted nodes never run; missing observer/root runs synchronously. */
export function scheduleNotesViewportRender(
  target: HTMLElement,
  rootInput: HTMLElement | null | (() => HTMLElement | null),
  render: () => void,
) {
  if (!rootInput || typeof IntersectionObserver === "undefined") {
    render();
    return () => {};
  }
  let cancelled = false;
  let remove: (() => void) | undefined;
  // NodeViews are constructed before ProseMirror/CodeMirror inserts their DOM.
  queueMicrotask(() => {
    if (cancelled || !target.isConnected) return;
    const root = typeof rootInput === "function" ? rootInput() : rootInput;
    if (!root) { render(); return; }
    let scheduler = schedulers.get(root);
    if (!scheduler) {
      scheduler = new ViewportRenderScheduler(root);
      schedulers.set(root, scheduler);
    }
    remove = scheduler.add(target, render);
  });
  return () => { cancelled = true; remove?.(); };
}
