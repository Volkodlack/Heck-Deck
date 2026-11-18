/**
 * Point d'accès réseau unique du client. Les composants utilisent `net.emit / net.on / net.id`
 * sans savoir si la partie tourne en local (solo / tuto), chez un hôte P2P ou sur un serveur dédié.
 */
import type { ClientToServer, ServerToClient } from '@shared';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => void;
type InEvents = ServerToClient & { connect: () => void; disconnect: (reason?: string) => void };

export interface Backend {
  readonly id: string;
  readonly kind: 'local' | 'host' | 'guest' | 'server';
  send(ev: string, args: unknown[]): void;
  close(): void;
}

export class NetProxy {
  private backend: Backend | null = null;
  private listeners = new Map<string, Set<Fn>>();

  get id(): string | undefined { return this.backend?.id; }
  get kind() { return this.backend?.kind ?? null; }
  get connected() { return !!this.backend; }

  on<K extends keyof InEvents>(ev: K, fn: InEvents[K]): this {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
    this.listeners.get(ev)!.add(fn as Fn);
    return this;
  }
  off<K extends keyof InEvents>(ev: K, fn: InEvents[K]): this {
    this.listeners.get(ev)?.delete(fn as Fn);
    return this;
  }
  once<K extends keyof InEvents>(ev: K, fn: InEvents[K]): this {
    const wrap = ((...a: unknown[]) => { this.off(ev, wrap as InEvents[K]); (fn as Fn)(...a); }) as InEvents[K];
    return this.on(ev, wrap);
  }

  emit<K extends keyof ClientToServer>(ev: K, ...args: Parameters<ClientToServer[K]>): void {
    this.backend?.send(ev, args);
  }

  /** Appelé par les backends pour livrer un événement aux abonnés. */
  deliver(ev: string, ...args: unknown[]) {
    this.listeners.get(ev)?.forEach((fn) => {
      try { fn(...args); } catch (e) { console.error('[net]', ev, e); }
    });
  }

  attach(b: Backend) {
    if (this.backend && this.backend !== b) this.detach('switch');
    this.backend = b;
    this.deliver('connect');
  }

  detach(reason = 'leave') {
    const b = this.backend;
    if (!b) return;
    this.backend = null;
    try { b.close(); } catch { /* ignore */ }
    this.deliver('disconnect', reason);
  }
}

export const net = new NetProxy();
