import { ACESFilmicToneMapping, PCFShadowMap, WebGPURenderer } from "three/webgpu";
import type { RenderQuality } from "./render-quality.ts";
import { avoidTransientAttachments } from "./transient-attachments.ts";

export async function createRenderer(canvas: HTMLCanvasElement, quality: RenderQuality): Promise<WebGPURenderer> {
  const renderer = new WebGPURenderer({
    alpha: false,
    antialias: quality.hasAntialias,
    canvas,
    depth: !quality.hasBloom,
    powerPreference: "high-performance",
    reversedDepthBuffer: true,
  });

  await renderer.init();
  avoidTransientAttachments(renderer);

  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  return renderer;
}
