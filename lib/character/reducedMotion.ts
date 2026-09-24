/**
 * Reduced-motion handling for the Live2D character (FR-014, FR-035, research D9).
 *
 * Live2D models keep moving even when no motion is active, because idle drift, breath,
 * physics, and auto-blink drive parameters continuously. "Do not start motions" alone
 * is not sufficient to reach a still character; each of these must be suppressed.
 *
 * When reduced motion is preferred:
 * 1. Idle motions are suppressed and no reaction motions start.
 * 2. Breath, physics, and auto-blink parameter updates are disabled.
 * 3. Expressions are still applied (via cross-fade, R10).
 */

export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function suppressIdleMotion(model: any): void {
  if (model?.internalModel?.motionManager) {
    const mm = model.internalModel.motionManager;
    mm.idleMotionGroup = '';
    if (typeof mm.stopAllMotions === 'function') {
      mm.stopAllMotions();
    }
    // Block any further motion playback
    mm.startMotion = async () => false;
    mm.startRandomMotion = async () => false;
  }
}

export function suppressBreath(model: any): void {
  if (model?.internalModel?.breath) {
    model.internalModel.breath.updateParameters = () => {};
  }
}

export function suppressPhysics(model: any): void {
  if (model?.internalModel?.physics) {
    model.internalModel.physics.evaluate = () => {};
  }
}

export function suppressAutoBlink(model: any): void {
  if (model?.internalModel?.eyeBlink) {
    model.internalModel.eyeBlink.updateParameters = () => {};
  }
}

export function suppressFocus(model: any): void {
  if (model?.internalModel?.updateFocus) {
    model.internalModel.updateFocus = () => {};
  }
}

/**
 * Applies full motion suppression to a Live2D model instance (R10).
 */
export function applyReducedMotion(model: any): void {
  suppressIdleMotion(model);
  suppressBreath(model);
  suppressPhysics(model);
  suppressAutoBlink(model);
  suppressFocus(model);
}
