import { describe, expect, it } from "vitest";
import { isWebKit, stripTransientAttachments } from "./transient-attachments.ts";

const RENDER_ATTACHMENT = 0x10;
const TEXTURE_BINDING = 0x04;
const TRANSIENT_ATTACHMENT = 0x20;

const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1";
const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const EDGE_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

describe("WebKit detection", () => {
  it("finds Safari on the Mac and on the iPhone", () => {
    expect(isWebKit(SAFARI_MAC)).toBe(true);
    expect(isWebKit(SAFARI_IPHONE)).toBe(true);
  });

  it("leaves out Chromium browsers", () => {
    expect(isWebKit(CHROME_MAC)).toBe(false);
    expect(isWebKit(EDGE_WINDOWS)).toBe(false);
  });
});

describe("transient attachments", () => {
  it("are dropped from texture usage while the other usages stay", () => {
    const usages: number[] = [];
    const device = {
      createTexture: (descriptor: GPUTextureDescriptor) => {
        usages.push(descriptor.usage);

        return descriptor.label;
      },
    };

    stripTransientAttachments(device);

    const label = device.createTexture({
      format: "rgba16float",
      label: "output-msaa",
      size: [4, 4],
      usage: RENDER_ATTACHMENT + TRANSIENT_ATTACHMENT,
    });

    device.createTexture({ format: "rgba8unorm", size: [4, 4], usage: RENDER_ATTACHMENT + TEXTURE_BINDING });

    expect(label).toBe("output-msaa");
    expect(usages).toEqual([RENDER_ATTACHMENT, RENDER_ATTACHMENT + TEXTURE_BINDING]);
  });
});
