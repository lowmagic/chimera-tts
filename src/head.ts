/**
 * Chimera's 3D wireframe head, moving with the live voice: the same renderer its duet page uses
 * (`Anatomy3D`), driven by the engine's telemetry, without the React shell around it.
 *
 * Like `voice.ts`, everything that reaches Chimera's engine facade is imported after the wasm has
 * loaded, and three.js only when a head is actually shown.
 */
import { PRESETS, sameBody, type BodyMix } from "../vendor/chimera/src/ui/body.ts";
import type { BodyName } from "./voice.ts";

type Three = typeof import("three");
type Anatomy3D = import("../vendor/chimera/src/ui/render/anatomy3d.ts").Anatomy3D;
type VoiceModel = import("../vendor/chimera/src/ui/analysis.ts").VoiceModel;

/** what the head shows of the airway: the pressure colours and the air moving, not the gauges */
const VIEW = { pressure: true, particles: true, grid: false, calipers: false };
/** a phone draws at most this many device pixels per CSS pixel (the voice needs the CPU more) */
const MAX_DPR = 1.5;

export class Head {
  private stopLoop: (() => void) | null = null;
  private body: BodyMix = PRESETS.male;
  private setBodyNow: ((b: BodyMix) => void) | null = null;

  constructor(private readonly wrap: HTMLElement) {}

  get shown(): boolean {
    return this.stopLoop !== null;
  }

  setBody(name: BodyName): void {
    this.body = PRESETS[name];
    this.setBodyNow?.(this.body);
  }

  /** Show the head (after the engine has loaded). Resolves false where WebGL is unavailable. */
  async show(): Promise<boolean> {
    if (this.stopLoop) return true;
    const [THREE, { Anatomy3D }, { VoiceModel }, { Glow }, { engine }, { NEUTRAL }, { OrbitControls }] = await Promise.all([
      import("three"),
      import("../vendor/chimera/src/ui/render/anatomy3d.ts"),
      import("../vendor/chimera/src/ui/analysis.ts"),
      import("../vendor/chimera/src/ui/render/vector.ts"),
      import("../vendor/chimera/src/audio/AudioEngine.ts"),
      import("../vendor/chimera/src/wasm/engine.ts"),
      import("three/addons/controls/OrbitControls.js"),
    ]);
    if (this.stopLoop) return true;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "The voice's head in 3D, moving as it speaks. Drag to turn it, double-click to turn it back.");
    const ctx = canvas.getContext("2d")!;
    const glCanvas = document.createElement("canvas");
    let gl: InstanceType<Three["WebGLRenderer"]>;
    try {
      gl = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } catch {
      return false;
    }
    // Chimera's palette is sRGB values passed straight through
    gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    gl.setClearColor(0x000000, 1);
    this.wrap.replaceChildren(canvas);

    const r: Anatomy3D = new Anatomy3D();
    r.centred = true;
    const glow = new Glow();
    const controls = new OrbitControls(r.camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.enablePan = false;
    controls.enableZoom = false; // the page scrolls; the head only turns

    let model: VoiceModel = new VoiceModel(this.body, engine.sampleRate);
    /** the camera has been placed for this model */
    let posed: VoiceModel | null = null;
    let refit = false;
    this.setBodyNow = (b) => {
      if (sameBody(b, model.body)) return;
      model.dispose();
      model = new VoiceModel(b, engine.sampleRate);
    };
    const home = () => {
      const p = r.poses(model);
      r.camera.position.copy(p.home);
      controls.target.copy(p.target);
    };
    canvas.addEventListener("dblclick", home);

    let w = 0, h = 0, dpr = 1;
    const fit = () => {
      const b = this.wrap.getBoundingClientRect();
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      refit = b.width !== w || b.height !== h;
      w = b.width;
      h = b.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      gl.setPixelRatio(dpr);
      gl.setSize(Math.max(1, w), Math.max(1, h), false);
      r.resize(Math.max(1, w), Math.max(1, h));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(this.wrap);
    fit();

    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000), elapsed = Math.min(0.5, (now - last) / 1000);
      last = now;
      if (w <= 0 || h <= 0) return;
      // the engine reports its state ~60 times a second once audio runs; before that, a head at rest
      const tele = engine.latest && sameBody(engine.latest.body, model.body) ? engine.latest : null;
      const a = tele ? VoiceModel.articFromArray(tele.t.artic) : NEUTRAL;
      r.face.update(tele, elapsed);
      if (posed !== model || refit) {
        home();
        posed = model;
        refit = false;
      }
      controls.update(dt);
      r.update(model, model.frame(a), a, tele, VIEW, dt);
      gl.render(r.scene, r.camera);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(glCanvas, 0, 0, canvas.width, canvas.height);
      glow.apply(canvas, ctx, dpr);
    };
    raf = requestAnimationFrame(loop);

    this.stopLoop = () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      r.dispose();
      model.dispose();
      gl.dispose();
      // browsers allow few live WebGL contexts: give this one back now
      gl.forceContextLoss();
      this.setBodyNow = null;
      this.wrap.replaceChildren();
    };
    return true;
  }

  hide(): void {
    this.stopLoop?.();
    this.stopLoop = null;
  }
}
