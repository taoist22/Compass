/**
 * Plugin button IDs. These must stay stable after release — the device keys
 * registered buttons by id, so changing one orphans the existing registration.
 *
 * Shared between index.js (registration) and the screen (press handling) so the
 * two can never drift apart.
 */
export const TOOLBAR_BUTTON_ID = 100;
export const LASSO_BUTTON_ID = 200;

/** pressEvent value the SDK sends for a lasso-toolbar button press. */
export const LASSO_PRESS_EVENT = 3;
