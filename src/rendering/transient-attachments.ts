import type { WebGPURenderer } from "three/webgpu";

const TRANSIENT_ATTACHMENT = 0x20;
const CHROMIUM_TOKEN = /Chrome|Chromium|Edg/u;

interface TextureMaker<Texture> {
  createTexture: (descriptor: GPUTextureDescriptor) => Texture;
}

function withoutTransientAttachment(usage: number): number {
  const hasTransientAttachment = Math.floor(usage / TRANSIENT_ATTACHMENT) % 2 === 1;

  return hasTransientAttachment ? usage - TRANSIENT_ATTACHMENT : usage;
}

export function isWebKit(userAgent: string): boolean {
  return userAgent.includes("AppleWebKit") && !CHROMIUM_TOKEN.test(userAgent);
}

export function stripTransientAttachments<Texture>(device: TextureMaker<Texture>): void {
  const createTexture = device.createTexture.bind(device);

  device.createTexture = (descriptor) => {
    return createTexture({ ...descriptor, usage: withoutTransientAttachment(descriptor.usage) });
  };
}

// Safari 27.2 loses the device on the first frame when three gives MSAA targets transient usage
// (WebKit bug 323873). Remove this once a Safari release ships the fix.
export function avoidTransientAttachments(renderer: WebGPURenderer): void {
  if (!isWebKit(navigator.userAgent)) {
    return;
  }

  const device: unknown = Reflect.get(renderer.backend, "device");

  if (!(device instanceof GPUDevice)) {
    return;
  }

  stripTransientAttachments(device);
}
