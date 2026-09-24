import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacter, type CreateOptions } from '@/lib/character/renderer';
import { EMOTIONS } from '@/lib/emotion';

/**
 * T022 - Renderer contract test covering:
 * - R5: two setEmotion calls in one frame leave exactly one reaction (the newer)
 * - R4 & R2: after reaction completes, expression is unchanged and idle loop is running
 * - R8 & R9: destroy() then createCharacter() yields one model, resource counts clean, double destroy safe
 * - R11: load failure or missing CubismCore calls onUnavailable once without throwing
 * - R6: setThinking(true) enters thinking state; setThinking(false) exits cleanly
 */

// Mock pixi.js and pixi-live2d-display/cubism4
const mockModelInstances: any[] = [];
let resourceCount = 0;

const createMockLive2DModel = () => {
  const currentExpression = { name: 'Normal' };
  let currentMotion: { group: string; index?: number; priority?: number } | null = null;
  let activeMotionCount = 0;

  const instance = {
    x: 0,
    y: 0,
    width: 800,
    height: 1000,
    scale: {
      x: 1,
      y: 1,
      set: vi.fn((s: number) => {
        instance.scale.x = s;
        instance.scale.y = s;
        instance.width = instance.internalModel.originalWidth * s;
        instance.height = instance.internalModel.originalHeight * s;
      }),
    },
    anchor: {
      x: 0,
      y: 0,
      set: vi.fn((x: number, y?: number) => {
        instance.anchor.x = x;
        instance.anchor.y = y !== undefined ? y : x;
      }),
    },
    destroyed: false,
    internalModel: {
      originalWidth: 800,
      originalHeight: 1000,
      motionManager: {
        idleMotionGroup: 'Idle',
        groups: { idle: 'Idle' },
        stopAllMotions: vi.fn(() => {
          activeMotionCount = 0;
          currentMotion = null;
        }),
        startMotion: vi.fn().mockImplementation((group: string, index?: number, priority?: number) => {
          currentMotion = { group, index, priority };
          activeMotionCount = 1;
          return Promise.resolve(true);
        }),
        startRandomMotion: vi.fn().mockImplementation((group: string) => {
          currentMotion = { group, priority: 1 };
          activeMotionCount = 1;
          return Promise.resolve(true);
        }),
        expressionManager: {
          setExpression: vi.fn().mockImplementation((name: string) => {
            currentExpression.name = name;
            return Promise.resolve(true);
          }),
        },
      },
    },
    motion: vi.fn().mockImplementation(function (group: string, index?: number, priority?: number) {
      currentMotion = { group, index, priority };
      activeMotionCount = 1;
      return Promise.resolve(true);
    }),
    expression: vi.fn().mockImplementation(function (name: string) {
      currentExpression.name = name;
      return Promise.resolve(true);
    }),
    focus: vi.fn(),
    destroy: vi.fn().mockImplementation(function () {
      instance.destroyed = true;
      resourceCount--;
    }),
    _getCurrentMotion: () => currentMotion,
    _getActiveMotionCount: () => activeMotionCount,
    _getCurrentExpression: () => currentExpression.name,
    _completeMotion: () => {
      activeMotionCount = 0;
      // When motion ends, idle motion is requested and expression is held
      instance.internalModel.motionManager.startRandomMotion('Idle');
    },
  };

  resourceCount++;
  mockModelInstances.push(instance);
  return instance;
};

vi.mock('pixi.js', () => {
  class MockApplication {
    stage = {
      children: [] as any[],
      addChild: vi.fn((child: any) => {
        this.stage.children.push(child);
      }),
      removeChild: vi.fn((child: any) => {
        const idx = this.stage.children.indexOf(child);
        if (idx !== -1) this.stage.children.splice(idx, 1);
      }),
    };
    renderer = {
      width: 400,
      height: 600,
      resize: vi.fn(function (this: any, w: number, h: number) {
        this.width = w;
        this.height = h;
      }),
    };
    resize = vi.fn();
    destroy = vi.fn().mockImplementation(() => {
      this.stage.children = [];
    });
  }

  return {
    Application: MockApplication,
    Ticker: { shared: {} },
  };
});

vi.mock('pixi-live2d-display/cubism4', () => {
  return {
    Live2DModel: {
      registerTicker: vi.fn(),
      from: vi.fn().mockImplementation(() => {
        return Promise.resolve(createMockLive2DModel());
      }),
    },
    MotionPriority: {
      NONE: 0,
      IDLE: 1,
      NORMAL: 2,
      FORCE: 3,
    },
    config: {
      sound: false,
      motionSync: false,
    },
    SoundManager: {
      volume: 0,
      play: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('Character Renderer Contract (T022)', () => {
  let canvas: HTMLCanvasElement;
  let onUnavailable: () => void;
  let onLabelChange: (label: string) => void;
  let defaultOptions: CreateOptions;

  beforeEach(async () => {
    (window as any).Live2DCubismCore = {};
    canvas = document.createElement('canvas');
    onUnavailable = vi.fn();
    onLabelChange = vi.fn();
    mockModelInstances.length = 0;
    resourceCount = 0;

    const { Live2DModel } = await import('pixi-live2d-display/cubism4');
    vi.mocked(Live2DModel.from).mockImplementation(() => {
      return Promise.resolve(createMockLive2DModel()) as any;
    });

    defaultOptions = {
      canvas,
      modelUrl: '/live2d/model/haru.model3.json',
      reducedMotion: false,
      onUnavailable,
      onLabelChange,
    };
  });

  it('R11: calls onUnavailable once and does not throw when Live2DCubismCore is missing', async () => {
    delete (window as any).Live2DCubismCore;

    const handle = await createCharacter(defaultOptions);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(handle.ready).toBe(false);

    // Calling methods on fallback handle is safe
    expect(() => {
      handle.setEmotion('happy');
      handle.setThinking(true);
      handle.resize();
      handle.destroy();
    }).not.toThrow();
  });

  it('R1: after createCharacter resolves, ready is true and initial label is calm', async () => {
    const handle = await createCharacter(defaultOptions);
    expect(handle.ready).toBe(true);
    expect(handle.currentLabel).toBe('calm');
    expect(mockModelInstances.length).toBe(1);
  });

  it('R5: two setEmotion calls in one frame leave exactly one reaction (the newer)', async () => {
    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    handle.setEmotion('sad');
    handle.setEmotion('happy');

    expect(model._getActiveMotionCount()).toBe(1);
    expect(model._getCurrentMotion().group).toBe('Flick'); // 'happy' maps to 'Flick'
    expect(model._getCurrentExpression()).toBe('Smile'); // 'happy' maps to 'Smile'
    expect(handle.currentLabel).toBe('happy');
  });

  it('R4 & R2: after reaction completes, expression is unchanged and idle loop is running', async () => {
    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    handle.setEmotion('surprised');
    expect(model._getCurrentMotion().group).toBe('FlickLeft');
    expect(model._getCurrentExpression()).toBe('Surprised');

    // Motion completes
    model._completeMotion();

    // Expression is held (R4)
    expect(model._getCurrentExpression()).toBe('Surprised');
    // Idle loop is running (R2)
    expect(model._getCurrentMotion().group).toBe('Idle');
  });

  it('R6: setThinking(true) enters thinking state; setThinking(false) returns to current emotion', async () => {
    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    handle.setEmotion('happy');
    expect(handle.currentLabel).toBe('happy');

    handle.setThinking(true);
    expect(handle.currentLabel).toBe('thoughtful');
    expect(model.focus).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));

    handle.setThinking(false);
    expect(handle.currentLabel).toBe('happy');
    expect(model.focus).toHaveBeenCalledWith(0, 0);
  });

  it('R8 & R9: destroy() cleans resources, repeated destroy() is safe, recreate yields 1 model', async () => {
    const handle = await createCharacter(defaultOptions);
    expect(resourceCount).toBe(1);

    handle.destroy();
    expect(resourceCount).toBe(0);

    // Second destroy is a safe no-op (R8)
    expect(() => handle.destroy()).not.toThrow();
    expect(resourceCount).toBe(0);

    // Recreating character yields exactly one new model
    const handle2 = await createCharacter(defaultOptions);
    expect(resourceCount).toBe(1);
    expect(handle2.ready).toBe(true);

    handle2.destroy();
  });

  it('R13: model rendered bounds are contained within canvas at both portrait and landscape aspect ratios (FR-042, T094)', async () => {
    const parent = document.createElement('div');
    parent.appendChild(canvas);

    // 1. Portrait container (narrow/tall: 300x800 vs model original 800x1000)
    let containerWidth = 300;
    let containerHeight = 800;
    Object.defineProperty(parent, 'clientWidth', {
      get: () => containerWidth,
      configurable: true,
    });
    Object.defineProperty(parent, 'clientHeight', {
      get: () => containerHeight,
      configurable: true,
    });

    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    const assertBoundsContained = (width: number, height: number) => {
      const minX = model.x - model.width * model.anchor.x;
      const maxX = model.x + model.width * (1 - model.anchor.x);
      const minY = model.y - model.height * model.anchor.y;
      const maxY = model.y + model.height * (1 - model.anchor.y);

      // Model must be centered
      expect(model.anchor.x).toBe(0.5);
      expect(model.anchor.y).toBe(0.5);
      expect(model.x).toBe(width / 2);
      expect(model.y).toBe(height / 2);

      // Model bounds must be strictly contained within canvas [0, width] and [0, height]
      expect(minX).toBeGreaterThanOrEqual(0);
      expect(maxX).toBeLessThanOrEqual(width);
      expect(minY).toBeGreaterThanOrEqual(0);
      expect(maxY).toBeLessThanOrEqual(height);
    };

    // Assert portrait bounds containment
    assertBoundsContained(containerWidth, containerHeight);

    // 2. Landscape container (wide/short: 1200x600 vs model original 800x1000)
    containerWidth = 1200;
    containerHeight = 600;
    handle.resize();

    // Assert landscape bounds containment
    assertBoundsContained(containerWidth, containerHeight);
  });
});
