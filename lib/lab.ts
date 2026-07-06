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
  prompt?: string | null,
): Promise<{ requestId: string }> {
  const res = await fetch(`${FAL_QUEUE}/${FAL_MODEL}`, {
    method: "POST",
    headers: falHeaders(),
    body: JSON.stringify({
      image_url: imageUrl,
      num_layers: numLayers,
      output_format: "png",
      ...(prompt ? { prompt } : {}),
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

const ESRGAN = "fal-ai/esrgan";

/**
 * AI super-resolution (Real-ESRGAN) so print output gets real detail rather
 * than interpolation. Runs synchronously (poll in-process); on any failure
 * returns null and the caller proceeds with the original.
 */
export async function upscaleImage(
  imageUrl: string,
  scale: 2 | 4,
): Promise<{ url: string; width: number; height: number } | null> {
  try {
    const submit = await fetch(`${FAL_QUEUE}/${ESRGAN}`, {
      method: "POST",
      headers: falHeaders(),
      body: JSON.stringify({
        image_url: imageUrl,
        scale,
        model: "RealESRGAN_x4plus",
        output_format: "png",
      }),
    });
    if (!submit.ok) return null;
    const { request_id } = (await submit.json()) as { request_id: string };
    const base = `${FAL_QUEUE}/${ESRGAN}/requests/${request_id}`;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const st = await fetch(`${base}/status`, { headers: falHeaders() });
      if (!st.ok) return null;
      const { status } = (await st.json()) as { status: string };
      if (status === "COMPLETED") {
        const res = await fetch(base, { headers: falHeaders() });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          image?: { url: string; width?: number; height?: number };
        };
        if (!json.image?.url) return null;
        return {
          url: json.image.url,
          width: json.image.width ?? 0,
          height: json.image.height ?? 0,
        };
      }
      if (status !== "IN_QUEUE" && status !== "IN_PROGRESS") return null;
    }
    return null;
  } catch {
    return null;
  }
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
