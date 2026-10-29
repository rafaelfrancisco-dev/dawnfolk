import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { fxaa } from "three/addons/tsl/display/FXAANode.js";
import { dot, float, mrt, output, pass, screenUV, vec4 } from "three/tsl";
import {
  type Camera,
  Color,
  DepthTexture,
  HalfFloatType,
  type Node,
  type PassNode,
  RenderPipeline,
  Scene,
  Vector2,
  type WebGPURenderer,
} from "three/webgpu";
import { ignore } from "../shared/ignore.ts";
import { createOutlineControls, OUTLINE_TARGET, outlinedColor, sceneTargets } from "./outlines.ts";
import type { RenderQuality } from "./render-quality.ts";

const BLOOM_STRENGTH = 0.28;
const BLOOM_RADIUS = 0.42;
const BLOOM_THRESHOLD = 1.1;
const VIGNETTE_STRENGTH = 0.38;

export interface RenderOutput {
  readonly dispose: () => void;
  readonly render: () => void;
  readonly setOutlinesShown: (areShown: boolean) => void;
}

interface FinishedColor {
  readonly color: Node<"vec4">;
  readonly dispose: () => void;
}

function withBloom(color: Node<"vec4">): FinishedColor {
  const glow = bloom(color, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD);
  const fromCenter = screenUV.sub(0.5);
  const vignette = float(1).sub(dot(fromCenter, fromCenter).mul(VIGNETTE_STRENGTH));

  return {
    color: vec4(color.add(glow).rgb.mul(vignette), 1),
    dispose: () => {
      glow.dispose();
    },
  };
}

function finish(color: Node<"vec4">, quality: RenderQuality): FinishedColor {
  if (quality.hasBloom) {
    return withBloom(color);
  }

  return { color, dispose: ignore };
}

// three clears the depth of a target the first time a pass that keeps depth renders to it, and a resize replaces the
// targets. Rendering nothing to each target, the depth owner first, spends that clear before the solid pass fills the
// shared depth, so clouds and water don't draw over the island for a frame.
function settleResizedTargets(
  renderer: WebGPURenderer,
  passes: readonly PassNode[],
  camera: Camera,
  size: Vector2,
  emptyScene: Scene
): void {
  const previousTarget = renderer.getRenderTarget();

  for (const scenePass of passes) {
    scenePass.setSize(size.x, size.y);
    renderer.setRenderTarget(scenePass.renderTarget);
    renderer.render(emptyScene, camera);
  }

  renderer.setRenderTarget(previousTarget);
}

export function createRenderOutput(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  quality: RenderQuality
): RenderOutput {
  const depthTexture = new DepthTexture();
  const solidPass = pass(scene, camera, { depthTexture, storeMultisampledColorBuffer: false });

  solidPass.transparent = false;
  solidPass.setMRT(sceneTargets());
  solidPass.getTexture(OUTLINE_TARGET).type = HalfFloatType;

  const seeThroughPass = pass(scene, camera, { depthTexture });

  seeThroughPass.opaque = false;
  seeThroughPass.autoClearDepth = false;
  seeThroughPass.setMRT(mrt({ output }).setClearColor("output", new Color(0, 0, 0), 0));

  const outlines = createOutlineControls();
  const surfaces = solidPass.getTextureNode(OUTLINE_TARGET);
  const outlined = outlinedColor(solidPass.getTextureNode("output"), surfaces, outlines);
  const seeThrough = seeThroughPass.getTextureNode("output");
  const finished = finish(vec4(outlined.mul(seeThrough.a.oneMinus()).add(seeThrough.rgb), 1), quality);
  const smoothed = fxaa(finished.color);

  const pipeline = new RenderPipeline(renderer, smoothed);
  const emptyScene = new Scene();
  const drawingBufferSize = new Vector2();
  const settledSize = new Vector2();

  return {
    dispose: () => {
      pipeline.dispose();
      smoothed.dispose();
      finished.dispose();
      seeThroughPass.dispose();
      solidPass.dispose();
      depthTexture.dispose();
    },
    render: () => {
      outlines.pixelRatio.value = renderer.getPixelRatio();
      renderer.getDrawingBufferSize(drawingBufferSize);

      if (!drawingBufferSize.equals(settledSize)) {
        settleResizedTargets(renderer, [solidPass, seeThroughPass], camera, drawingBufferSize, emptyScene);
        settledSize.copy(drawingBufferSize);
      }

      pipeline.render();
    },
    setOutlinesShown: (areShown) => {
      outlines.strength.value = areShown ? 1 : 0;
    },
  };
}
