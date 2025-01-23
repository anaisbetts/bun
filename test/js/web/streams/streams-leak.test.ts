import { beforeAll, afterAll, test, expect } from "bun:test";
import type { Subprocess } from "bun";
import jsc from "bun:jsc";

var cat: Subprocess<"pipe", "pipe", "inherit">;
var r: ReadableStreamDefaultReader<Uint8Array>;

const BYTES_TO_WRITE = 1_000_000;
beforeAll(() => {
  cat = Bun.spawn(["cat"], {
    stdin: "pipe",
    stdout: "pipe",
  });
  r = cat.stdout.getReader() as any;
});

afterAll(() => {
  r = null!;
  cat.stdin.end();
  cat.kill();
});

async function readAndWrite(bytes = BYTES_TO_WRITE) {
  const buf = new Uint8Array(bytes);
  await cat.stdin.write(buf);

  let i = 0;
  for (let chunks = 0; chunks < bytes; chunks++) {
    const { value } = await r.read();
    i += value?.length ?? 0;
    if (i >= buf.length) {
      return;
    }
  }
  throw new Error("infinite loop");
}

// https://github.com/oven-sh/bun/issues/12198
test("PullIntoDescriptors do not leak buffers", async () => {
  const rounds = 250;
  const warmup = 10;

  for (let i = 0; i < warmup; i++) {
    await readAndWrite(10_000);
  }
  Bun.gc(true);

  const { heapUsed: heapUsedBefore } = process.memoryUsage();
  Bun.write(`streams-leak.warmup.heapsnapshot`, Bun.generateHeapSnapshot("v8"));

  for (let i = 0; i < rounds; i++) {
    await readAndWrite();
  }
  Bun.gc(true);
  const { heapUsed: heapUsedAfter } = process.memoryUsage();
  Bun.gc(true);

  const newHeapUsed = heapUsedAfter - heapUsedBefore;
  expect(newHeapUsed).toBeLessThan((BYTES_TO_WRITE * rounds) / 2);
});
