// One controller for the whole app (owns simulation, rAF loop and canvas renderer).
import { SimController } from '../render/controller.js';
export const ctrl = new SimController();
if (import.meta.env && import.meta.env.DEV) window.__ctrl = ctrl;
