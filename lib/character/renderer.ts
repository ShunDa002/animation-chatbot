import { type Emotion, isEmotion, NEUTRAL } from '@/lib/emotion';
import { EMOTION_MAP } from './emotionMap';
import { applyReducedMotion } from './reducedMotion';

/**
 * Character Renderer (contracts/character-renderer.md).
 *
 * Imperative, framework-agnostic Live2D character lifecycle manager using PixiJS v7
 * and pixi-live2d-display (Cubism 4).
 *
 * Satisfies: FR-005, FR-008 to FR-014, FR-035, FR-038, SC-002, SC-003.
 */

export interface CharacterHandle {
  setEmotion(emotion: Emotion): void;
  setThinking(thinking: boolean): void;
  resize(): void;
  destroy(): void;
  readonly ready: boolean;
  readonly currentLabel: string;
}

export interface CreateOptions {
  canvas: HTMLCanvasElement;
  modelUrl: string;
  reducedMotion: boolean;
  signal?: AbortSignal;
  onUnavailable(): void;
  onLabelChange(label: string): void;
}

function createFallbackHandle(initialLabel = 'calm'): CharacterHandle {
  return {
    setEmotion: () => {},
    setThinking: () => {},
    resize: () => {},
    destroy: () => {},
    ready: false,
    currentLabel: initialLabel,
  };
}

export async function createCharacter(options: CreateOptions): Promise<CharacterHandle> {
  const { canvas, modelUrl, reducedMotion, signal, onUnavailable, onLabelChange } = options;

  if (signal?.aborted) {
    return createFallbackHandle();
  }

  // Load-order check: window.Live2DCubismCore must exist (D2, D3, R11)
  if (typeof window === 'undefined' || !(window as any).Live2DCubismCore) {
    onUnavailable();
    return createFallbackHandle();
  }

  let app: any;
  let model: any;
  let isDestroyed = false;
  let currentEmotion: Emotion = NEUTRAL;
  let currentLabel: string = EMOTION_MAP[NEUTRAL].label;
  let isThinking = false;

  try {
    const PIXI = await import('pixi.js');
    if (signal?.aborted) return createFallbackHandle();

    const cubism4 = (await import('pixi-live2d-display/cubism4')) as any;
    if (signal?.aborted) return createFallbackHandle();

    const Live2DModel = cubism4.Live2DModel;
    const MotionPriority = cubism4.MotionPriority;

    if (cubism4.config) {
      cubism4.config.sound = false;
      cubism4.config.motionSync = false;
    }

    if (cubism4.SoundManager) {
      try {
        cubism4.SoundManager.volume = 0;
        cubism4.SoundManager.play = () => Promise.resolve();
      } catch {}
    }

    // Expose PIXI to window so pixi-live2d-display can register ticker
    (window as any).PIXI = PIXI;
    Live2DModel.registerTicker(PIXI.Ticker);

    app = new PIXI.Application({
      view: canvas,
      autoStart: true,
      backgroundAlpha: 0,
      antialias: true,
    });

    if (signal?.aborted) {
      try {
        app.destroy(false);
      } catch {}
      return createFallbackHandle();
    }

    // Load Live2D Cubism 4 model
    try {
      model = await Live2DModel.from(modelUrl, { autoHitTest: false, autoFocus: false });
    } catch (loadErr: any) {
      if (isDestroyed || signal?.aborted || loadErr?.message === 'Aborted') {
        return createFallbackHandle();
      }
      throw loadErr;
    }

    if (isDestroyed || signal?.aborted) {
      try {
        model.destroy();
        app.destroy(false);
      } catch {}
      return createFallbackHandle();
    }

    // Patch Cubism4InternalModel.prototype.updateWebGLContext to avoid crash on models without clipping masks (Haru)
    if (model.internalModel) {
      const proto = Object.getPrototypeOf(model.internalModel);
      if (proto && !proto.__patchedUpdateWebGLContext) {
        proto.__patchedUpdateWebGLContext = true;
        proto.updateWebGLContext = function (gl: any, glContextID: any) {
          try {
            if (this.renderer) {
              this.renderer.firstDraw = true;
              this.renderer._bufferData = { vertex: null, uv: null, index: null };
              this.renderer.startUp(gl);
              if (this.renderer._clippingManager) {
                this.renderer._clippingManager._currentFrameNo = glContextID;
                this.renderer._clippingManager._maskTexture = void 0;
              }
            }
          } catch (e) {
            console.warn('[updateWebGLContext safe error]', e);
          }
        };
      }
    }

    app.stage.addChild(model);

    // Layout model on canvas (FR-042, R13)
    const layoutModel = () => {
      if (!model) return;
      const container = (typeof canvas.closest === 'function' ? canvas.closest('.character-area') : null) || canvas.parentElement;
      const width = container?.clientWidth || (app.renderer ? app.renderer.width : 400);
      const height = container?.clientHeight || (app.renderer ? app.renderer.height : 600);

      if (
        app.renderer &&
        typeof app.renderer.resize === 'function' &&
        (app.renderer.width !== width || app.renderer.height !== height)
      ) {
        app.renderer.resize(width, height);
      }

      if (model.anchor && typeof model.anchor.set === 'function') {
        model.anchor.set(0.5, 0.5);
      }
      if (typeof model.x === 'number') {
        model.x = width / 2;
        model.y = height / 2;
      }

      const originalWidth = model.internalModel?.originalWidth || model.width;
      const originalHeight = model.internalModel?.originalHeight || model.height;

      if (originalWidth && originalHeight && height > 0 && width > 0) {
        const scaleX = width / originalWidth;
        const scaleY = height / originalHeight;
        // Contain-fit scale with 0.85 visual padding factor for breathing room (FR-042, R13)
        const scale = Math.min(scaleX, scaleY) * 0.85;
        if (model.scale && typeof model.scale.set === 'function') {
          model.scale.set(scale);
        }
      }
    };

    layoutModel();

    // Reduced motion configuration (T023, FR-009, FR-035)
    if (reducedMotion) {
      applyReducedMotion(model);
    } else {
      if (model.motion) {
        try {
          model.motion('Idle', undefined, MotionPriority.IDLE);
        } catch {}
      }
    }

    // Set initial baseline neutral expression
    if (model.expression) {
      try {
        model.expression(EMOTION_MAP[NEUTRAL].expression);
      } catch {}
    }

    onLabelChange(currentLabel);

    const handle: CharacterHandle = {
      get ready() {
        return !isDestroyed;
      },
      get currentLabel() {
        return currentLabel;
      },
      setEmotion(emotion: Emotion) {
        if (isDestroyed) return;

        // R7: Unknown value guard
        const validEmotion = isEmotion(emotion) ? emotion : NEUTRAL;
        currentEmotion = validEmotion;
        const presentation = EMOTION_MAP[validEmotion];

        if (!isThinking) {
          currentLabel = presentation.label;
          onLabelChange(currentLabel);
        }

        if (reducedMotion) {
          // R10: Expression only, no motion
          if (model.expression) {
            try {
              model.expression(presentation.expression);
            } catch {}
          }
        } else {
          // R3, R4, R5: Start reaction at FORCE priority, apply and hold expression
          if (model.motion) {
            try {
              model.motion(presentation.motionGroup, presentation.motionIndex, MotionPriority.FORCE);
            } catch {}
          }
          if (model.expression) {
            try {
              model.expression(presentation.expression);
            } catch {}
          }
        }
      },
      setThinking(thinking: boolean) {
        if (isDestroyed) return;
        isThinking = thinking;

        if (thinking) {
          // R6: Enter visibly distinct thinking state (FR-010)
          currentLabel = 'thoughtful';
          onLabelChange(currentLabel);

          if (!reducedMotion && typeof (model as any).focus === 'function') {
            (model as any).focus(0.2, 0.4);
          }
        } else {
          // R6: Exit thinking state cleanly
          currentLabel = EMOTION_MAP[currentEmotion].label;
          onLabelChange(currentLabel);

          if (!reducedMotion && typeof (model as any).focus === 'function') {
            (model as any).focus(0, 0);
          }
        }
      },
      resize() {
        if (isDestroyed) return;
        layoutModel();
      },
      destroy() {
        if (isDestroyed) return;
        isDestroyed = true;

        try {
          if (app?.ticker) {
            try {
              app.ticker.stop();
            } catch {}
          }
          if (model) {
            if (model.internalModel?.motionManager) {
              try {
                model.internalModel.motionManager.stopAllMotions();
              } catch {}
            }
            if (model.parent) {
              try {
                model.parent.removeChild(model);
              } catch {}
            }
            try {
              model.destroy();
            } catch {}
          }
          if (app) {
            try {
              app.destroy(false, { children: true, texture: true, baseTexture: true });
            } catch {}
          }
        } catch {
          // Double destroy / cleanup errors ignored per R8
        }
      },
    };

    return handle;
  } catch (_err) {
    console.error('[renderer] createCharacter error in catch:', _err);
    // R11: WebGL or asset failure calls onUnavailable once without throwing
    onUnavailable();
    if (app) {
      try {
        app.destroy(true);
      } catch {}
    }
    return createFallbackHandle();
  }
}
