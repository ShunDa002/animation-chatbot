import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharacter, type CreateOptions } from '@/lib/character/renderer';
import { EMOTIONS } from '@/lib/emotion';
import {
  EMOTION_MAP,
  IDLE_MOTION_INDICES,
  STRONG_EMOTION_MOTION_INDICES,
  HAPPY_MOTION_INDICES,
} from '@/lib/character/emotionMap';

/**
 * T022 / T135 - Renderer contract test covering:
 * - R5: two setEmotion calls in one frame leave exactly one reaction (the newer)
 * - R1: after createCharacter resolves, idle sequence begins with random 3-8s delay from neutral/subtle pool
 * - R4 & R2: after reaction completes, expression is unchanged and idle sequence resumes with 3-8s delay
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
  const eventListeners: Record<string, Array<() => void>> = {};
  const playedMotions: Array<{ group: string; index?: number; priority?: number }> = [];

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
        idleMotionGroup: '',
        groups: { idle: '' },
        playing: false,
        on: vi.fn((event: string, cb: () => void) => {
          if (!eventListeners[event]) eventListeners[event] = [];
          eventListeners[event].push(cb);
        }),
        off: vi.fn((event: string, cb: () => void) => {
          if (eventListeners[event]) {
            eventListeners[event] = eventListeners[event].filter((fn) => fn !== cb);
          }
        }),
        emit: vi.fn((event: string) => {
          eventListeners[event]?.forEach((cb) => cb());
        }),
        stopAllMotions: vi.fn(() => {
          activeMotionCount = 0;
          currentMotion = null;
          instance.internalModel.motionManager.playing = false;
        }),
        startMotion: vi.fn().mockImplementation((group: string, index?: number, priority?: number) => {
          currentMotion = { group, index, priority };
          activeMotionCount = 1;
          instance.internalModel.motionManager.playing = true;
          playedMotions.push({ group, index, priority });
          return Promise.resolve(true);
        }),
        startRandomMotion: vi.fn().mockImplementation((group: string) => {
          currentMotion = { group, priority: 1 };
          activeMotionCount = 1;
          instance.internalModel.motionManager.playing = true;
          playedMotions.push({ group, priority: 1 });
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
      instance.internalModel.motionManager.playing = true;
      playedMotions.push({ group, index, priority });
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
    _getPlayedMotions: () => [...playedMotions],
    _completeMotion: () => {
      activeMotionCount = 0;
      currentMotion = null;
      instance.internalModel.motionManager.playing = false;
      eventListeners['motionFinish']?.forEach((cb) => cb());
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

const mockLive2DDisplay = {
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

vi.mock('pixi-live2d-display/cubism4', () => mockLive2DDisplay);
vi.mock('pixi-live2d-display/cubism2', () => mockLive2DDisplay);

describe('Character Renderer Contract (T022)', () => {
  let canvas: HTMLCanvasElement;
  let onUnavailable: () => void;
  let onLabelChange: (label: string) => void;
  let defaultOptions: CreateOptions;

  beforeEach(async () => {
    vi.useFakeTimers();
    (window as any).Live2DCubismCore = {};
    (window as any).Live2D = {};
    canvas = document.createElement('canvas');
    onUnavailable = vi.fn();
    onLabelChange = vi.fn();
    mockModelInstances.length = 0;
    resourceCount = 0;

    mockLive2DDisplay.Live2DModel.from.mockImplementation(() => {
      return Promise.resolve(createMockLive2DModel()) as any;
    });

    defaultOptions = {
      canvas,
      modelUrl: '/live2d/model/rem.json',
      reducedMotion: false,
      onUnavailable,
      onLabelChange,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('R11: calls onUnavailable once and does not throw when Live2DCubismCore is missing', async () => {
    delete (window as any).Live2DCubismCore;
    delete (window as any).Live2D;

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

  it('R1: after createCharacter resolves, ready is true, and an idle sequence plays with random 3-8s delay from neutral/subtle pool (FR-005)', async () => {
    const handle = await createCharacter(defaultOptions);
    expect(handle.ready).toBe(true);
    expect(handle.currentLabel).toBe('calm');
    expect(mockModelInstances.length).toBe(1);

    const model = mockModelInstances[0];

    // Guarantee R1: No motion should start immediately at t=0 (not a continuous 0-delay loop)
    expect(model._getCurrentMotion()).toBeNull();

    // Advancing by less than minimum delay (e.g., 2500ms < 3000ms) MUST NOT start any idle motion
    vi.advanceTimersByTime(2500);
    expect(model._getCurrentMotion()).toBeNull();

    // Advancing past the maximum delay range (total 8000ms) MUST trigger an idle motion
    vi.advanceTimersByTime(5500);
    const motion = model._getCurrentMotion();
    expect(motion).not.toBeNull();
    expect(motion.priority).toBe(1); // MotionPriority.IDLE
    expect(motion.group).toBe(EMOTION_MAP.neutral.motionGroup);

    // Positive assertion: must be selected from the neutral/subtle motion pool
    expect(IDLE_MOTION_INDICES).toContain(motion.index);

    // Negative assertions: strong emotional reactions MUST NEVER be selected
    expect(motion.index).not.toBe(EMOTION_MAP.angry.motionIndex);
    expect(motion.index).not.toBe(EMOTION_MAP.sad.motionIndex);
    expect(STRONG_EMOTION_MOTION_INDICES).not.toContain(motion.index);

    // Sample across 20 idle cycles to statistically verify randomness and exclusion
    for (let i = 0; i < 20; i++) {
      model._completeMotion();
      // Wait for delay window to trigger next idle motion
      vi.advanceTimersByTime(8000);
      const nextMotion = model._getCurrentMotion();
      expect(nextMotion).not.toBeNull();
      expect(nextMotion.priority).toBe(1);
      expect(IDLE_MOTION_INDICES).toContain(nextMotion.index);
      expect(STRONG_EMOTION_MOTION_INDICES).not.toContain(nextMotion.index);
    }
  });

  it('R5: two setEmotion calls in one frame leave exactly one reaction (the newer)', async () => {
    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    handle.setEmotion('sad');
    handle.setEmotion('happy');

    expect(model._getActiveMotionCount()).toBe(1);
    expect(model._getCurrentMotion().group).toBe(EMOTION_MAP.happy.motionGroup);
    expect(HAPPY_MOTION_INDICES).toContain(model._getCurrentMotion().index);
    expect(model._getCurrentExpression()).toBe('Normal'); // expression is unchanged (undefined in map)
    expect(handle.currentLabel).toBe('happy');
  });

  it('randomly selects from available happy motions when setEmotion("happy") is called', async () => {
    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    const randomSpy = vi.spyOn(Math, 'random');

    randomSpy.mockReturnValue(0.1);
    handle.setEmotion('happy');
    expect(model._getCurrentMotion().index).toBe(HAPPY_MOTION_INDICES[Math.floor(0.1 * HAPPY_MOTION_INDICES.length)]);

    randomSpy.mockReturnValue(0.5);
    handle.setEmotion('happy');
    expect(model._getCurrentMotion().index).toBe(HAPPY_MOTION_INDICES[Math.floor(0.5 * HAPPY_MOTION_INDICES.length)]);

    randomSpy.mockReturnValue(0.9);
    handle.setEmotion('happy');
    expect(model._getCurrentMotion().index).toBe(HAPPY_MOTION_INDICES[Math.floor(0.9 * HAPPY_MOTION_INDICES.length)]);

    randomSpy.mockRestore();
  });

  it('R4 & R2: after reaction completes, expression is unchanged and idle sequence resumes with 3-8s delay (FR-005, FR-008)', async () => {
    const handle = await createCharacter(defaultOptions);
    const model = mockModelInstances[0];

    handle.setEmotion('surprised');
    expect(model._getCurrentMotion().group).toBe(EMOTION_MAP.surprised.motionGroup);
    expect(model._getCurrentMotion().index).toBe(EMOTION_MAP.surprised.motionIndex);
    expect(model._getCurrentExpression()).toBe('Normal');

    // Motion completes
    model._completeMotion();

    // Expression is held (R4)
    expect(model._getCurrentExpression()).toBe('Normal');

    // Idle sequence does not start immediately at t=0
    expect(model._getCurrentMotion()).toBeNull();

    // Advancing by less than minimum delay (e.g., 2500ms < 3000ms) MUST NOT start any idle motion
    vi.advanceTimersByTime(2500);
    expect(model._getCurrentMotion()).toBeNull();

    // Advancing past the maximum delay range (total 8000ms) MUST trigger an idle motion (R2)
    vi.advanceTimersByTime(5500);
    const resumedMotion = model._getCurrentMotion();
    expect(resumedMotion).not.toBeNull();
    expect(resumedMotion.priority).toBe(1); // MotionPriority.IDLE
    expect(resumedMotion.group).toBe(EMOTION_MAP.neutral.motionGroup);
    expect(IDLE_MOTION_INDICES).toContain(resumedMotion.index);
    expect(STRONG_EMOTION_MOTION_INDICES).not.toContain(resumedMotion.index);

    // Expression remains held (R4)
    expect(model._getCurrentExpression()).toBe('Normal');
  });

  it('R10: with reducedMotion: true, idle sequence timer never triggers motions', async () => {
    const handle = await createCharacter({
      ...defaultOptions,
      reducedMotion: true,
    });
    const model = mockModelInstances[0];

    // Advancing time significantly (30s) MUST NOT trigger any motion
    vi.advanceTimersByTime(30000);
    expect(model._getCurrentMotion()).toBeNull();
    expect(model._getPlayedMotions().length).toBe(0);
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

  it('R13: model rendered bounds rest precisely at the bottom boundary with no empty space beneath at both portrait and landscape aspect ratios (FR-042, T137)', async () => {
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

    const assertBoundsContainedAndBottomAnchored = (width: number, height: number) => {
      const minX = model.x - model.width * model.anchor.x;
      const maxX = model.x + model.width * (1 - model.anchor.x);
      const minY = model.y - model.height * model.anchor.y;
      const maxY = model.y + model.height * (1 - model.anchor.y);

      // Model must be horizontally centered and bottom-anchored (FR-042, R13)
      expect(model.anchor.x).toBe(0.5);
      expect(model.anchor.y).toBe(1);
      expect(model.x).toBe(width / 2);
      expect(model.y).toBe(height);

      // Model bounds must rest precisely at the bottom boundary (no empty space beneath)
      expect(maxY).toBe(height);

      // Model bounds must be strictly contained within canvas [0, width] and [0, height]
      expect(minX).toBeGreaterThanOrEqual(0);
      expect(maxX).toBeLessThanOrEqual(width);
      expect(minY).toBeGreaterThanOrEqual(0);
    };

    // Assert portrait bounds containment and bottom anchoring
    assertBoundsContainedAndBottomAnchored(containerWidth, containerHeight);

    // 2. Landscape container (wide/short: 1200x600 vs model original 800x1000)
    containerWidth = 1200;
    containerHeight = 600;
    handle.resize();

    // Assert landscape bounds containment and bottom anchoring after resize
    assertBoundsContainedAndBottomAnchored(containerWidth, containerHeight);
  });
});
