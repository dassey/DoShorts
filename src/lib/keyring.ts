// Page-side handle to the keyring worker. Keys go in; they never come back out.
import { GenerationError } from "./errors";
import type { KeyringRequest, KeyStatus } from "./keyring.worker";

export type { KeyStatus };

type Reply = { id: number; ok: true; value: unknown } | { id: number; ok: false; message: string; status: number };

// Module-private: nothing on `window` leads to the worker.
let worker: Worker | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function start(): Worker {
  const w = new Worker(new URL("./keyring.worker.ts", import.meta.url), { type: "module", name: "keyring" });
  w.addEventListener("message", (event: MessageEvent<Reply>) => {
    const reply = event.data;
    const waiter = pending.get(reply.id);
    if (!waiter) return;
    pending.delete(reply.id);
    if (reply.ok) waiter.resolve(reply.value);
    else waiter.reject(new GenerationError(reply.message, reply.status));
  });
  return w;
}

export function keyring<T = KeyStatus>(req: KeyringRequest): Promise<T> {
  worker ??= start();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    worker!.postMessage({ id, req });
  });
}
