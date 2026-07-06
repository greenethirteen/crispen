// Server-side helpers for the /lab pipeline: fal.ai queue client + auth gate.

const FAL_MODEL = "fal-ai/qwen-image-layered";
const FAL_QUEUE = "https://queue.fal.run";

export function labAuthorized(password: unknown): boolean {
  return password === (process.env.ADMIN_PASSWORD || "1059");
}

function falKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  return key;
}

function falHeaders(): HeadersInit {
  return {
    Authorization: `Key ${falKey()}`,
    "Content-Type": "application/json",
  };
}

/** Submit an image (public URL or data URI) for layer decomposition. */
export async function submitSeparation(
  imageUrl: string,
  numLayers: number,
): Promise<{ requestId: string }> {
  const res = await fetch(`${FAL_QUEUE}/${FAL_MODEL}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify({
      image_url: imageUrl,
      num_layers: numLayers,
      output_format: "png",
      // Reproducible runs; a few extra steps for separation quality
      // (fal bills per output image, not per step).
      seed: 4242,
      num_inference_steps: 36,
    }),
  });
  if (!res.ok) {
    throw new Error(`fal submit failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { request_id: string };
  return { requestId: json.request_id };
}

export type SeparationStatus =
  | { status: "IN_QUEUE" | "IN_PROGRESS" }
  | { status: "COMPLETED"; layers: { url: string; width: number; height: number }[] }
  | { status: "FAILED"; error: string };

/** Poll a queued decomposition; on completion, fetch and shape the result. */
export async function pollSeparation(
  requestId: string,
): Promise<SeparationStatus> {
  const base = `${FAL_QUEUE}/${FAL_MODEL}/requests/${requestId}`;
  const statusRes = await fetch(`${base}/status`, { headers: falHeaders() });
  if (!statusRes.ok) {
    throw new Error(`fal status failed (${statusRes.status})`);
  }
  const status = (await statusRes.json()) as { status: string };

  if (status.status === "IN_QUEUE" || status.status === "IN_PROGRESS") {
    return { status: status.status };
  }
  if (status.status !== "COMPLETED") {
    return { status: "FAILED", error: `fal status: ${status.status}` };
  }

  const resultRes = await fetch(base, { headers: falHeaders() });
  if (!resultRes.ok) {
    throw new Error(`fal result failed (${resultRes.status})`);
  }
  const result = (await resultRes.json()) as {
    images?: { url: string; width?: number; height?: number }[];
  };
  const layers = (result.images ?? []).map((img) => ({
    url: img.url,
    width: img.width ?? 0,
    height: img.height ?? 0,
  }));
  if (layers.length === 0) {
    return { status: "FAILED", error: "fal returned no layers" };
  }
  return { status: "COMPLETED", layers };
}
