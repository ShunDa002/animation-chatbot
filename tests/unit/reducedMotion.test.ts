import { describe, expect, it, vi } from 'vitest';
import {
  isReducedMotionPreferred,
  suppressIdleMotion,
  suppressBreath,
  suppressPhysics,
  suppressAutoBlink,
  applyReducedMotion,
} from '@/lib/character/reducedMotion';

/**
 * T024 - Reduced-motion unit test:
 * With reducedMotion: true, no parameter driven by breath, physics, or blink changes across 60
 * consecutive frames, while setEmotion / expression still changes the expression (R10).
 */

interface MockCoreModel {
  parameters: Record<string, number>;
  getParameterValueById(id: string): number;
  setParameterValueById(id: string, value: number): void;
}

function createMockModel() {
  const params: Record<string, number> = {
    PARAM_ANGLE_X: 0,
    PARAM_BREATH: 0,
    PARAM_EYE_L_OPEN: 1.0,
    PARAM_EYE_R_OPEN: 1.0,
    PARAM_HAIR_FRONT: 0,
    PARAM_EYE_SMILE: 0,
  };

  const coreModel: MockCoreModel = {
    parameters: params,
    getParameterValueById(id: string) {
      return this.parameters[id] ?? 0;
    },
    setParameterValueById(id: string, value: number) {
      this.parameters[id] = value;
    },
  };

  const model = {
    internalModel: {
      coreModel,
      motionManager: {
        idleMotionGroup: 'Idle',
        stopAllMotions: vi.fn(),
        startMotion: vi.fn().mockResolvedValue(true),
        startRandomMotion: vi.fn().mockResolvedValue(true),
        expressionManager: {
          setExpression: vi.fn().mockImplementation((name: string) => {
            if (name === 'Smile') {
              coreModel.setParameterValueById('PARAM_EYE_SMILE', 1.0);
            } else if (name === 'Normal') {
              coreModel.setParameterValueById('PARAM_EYE_SMILE', 0.0);
            }
            return Promise.resolve(true);
          }),
        },
      },
      breath: {
        updateParameters: vi.fn().mockImplementation((cm: MockCoreModel, dt: number) => {
          cm.setParameterValueById('PARAM_BREATH', cm.getParameterValueById('PARAM_BREATH') + dt);
        }),
      },
      physics: {
        evaluate: vi.fn().mockImplementation((cm: MockCoreModel) => {
          cm.setParameterValueById('PARAM_HAIR_FRONT', cm.getParameterValueById('PARAM_HAIR_FRONT') + 0.1);
        }),
      },
      eyeBlink: {
        updateParameters: vi.fn().mockImplementation((cm: MockCoreModel, dt: number) => {
          cm.setParameterValueById('PARAM_EYE_L_OPEN', Math.max(0, cm.getParameterValueById('PARAM_EYE_L_OPEN') - dt));
          cm.setParameterValueById('PARAM_EYE_R_OPEN', Math.max(0, cm.getParameterValueById('PARAM_EYE_R_OPEN') - dt));
        }),
      },
      updateFocus: vi.fn(),
    },
    expression: vi.fn().mockImplementation(function (name: string) {
      return (model.internalModel.motionManager.expressionManager as any).setExpression(name);
    }),
    motion: vi.fn().mockImplementation(function (group: string, index?: number, priority?: number) {
      return model.internalModel.motionManager.startMotion(group, index, priority);
    }),
  };

  return model;
}

describe('Reduced Motion (T024 / T027)', () => {
  it('reads matchMedia preference correctly', () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
    }) as any;

    expect(isReducedMotionPreferred()).toBe(true);

    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
    }) as any;

    expect(isReducedMotionPreferred()).toBe(false);
  });

  it('suppresses individual subsystems', () => {
    const model = createMockModel();
    suppressIdleMotion(model);
    expect(model.internalModel.motionManager.idleMotionGroup).toBe('');
    expect(model.internalModel.motionManager.stopAllMotions).toHaveBeenCalled();

    suppressBreath(model);
    model.internalModel.breath.updateParameters(model.internalModel.coreModel, 16);
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_BREATH')).toBe(0);

    suppressPhysics(model);
    model.internalModel.physics.evaluate(model.internalModel.coreModel);
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_HAIR_FRONT')).toBe(0);

    suppressAutoBlink(model);
    model.internalModel.eyeBlink.updateParameters(model.internalModel.coreModel, 16);
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_EYE_L_OPEN')).toBe(1.0);
  });

  it('with reducedMotion: true, no breath, physics, or blink param changes across 60 frames while expression changes work (R10)', async () => {
    const model = createMockModel();
    applyReducedMotion(model);

    const initialBreath = model.internalModel.coreModel.getParameterValueById('PARAM_BREATH');
    const initialPhysics = model.internalModel.coreModel.getParameterValueById('PARAM_HAIR_FRONT');
    const initialEyeL = model.internalModel.coreModel.getParameterValueById('PARAM_EYE_L_OPEN');
    const initialEyeR = model.internalModel.coreModel.getParameterValueById('PARAM_EYE_R_OPEN');

    // Simulate 60 consecutive frames
    for (let frame = 0; frame < 60; frame++) {
      model.internalModel.breath?.updateParameters(model.internalModel.coreModel, 16 / 1000);
      model.internalModel.physics?.evaluate(model.internalModel.coreModel);
      model.internalModel.eyeBlink?.updateParameters(model.internalModel.coreModel, 16 / 1000);
    }

    // Assert no parameters changed across 60 frames
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_BREATH')).toBe(initialBreath);
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_HAIR_FRONT')).toBe(initialPhysics);
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_EYE_L_OPEN')).toBe(initialEyeL);
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_EYE_R_OPEN')).toBe(initialEyeR);

    // Assert motions are blocked
    const motionResult = await model.motion('Flick', 0, 3);
    expect(motionResult).toBe(false);

    // Assert expression STILL changes
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_EYE_SMILE')).toBe(0);
    await model.expression('Smile');
    expect(model.internalModel.coreModel.getParameterValueById('PARAM_EYE_SMILE')).toBe(1.0);
  });
});
