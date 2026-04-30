/**
 * Simple pub/sub event bus.
 *
 * Events used in this application:
 *   'tree-changed'    – any mutation to the tree (add, remove, rename, move, set values)
 *   'project-loaded'  – a project was initialised or loaded from file
 *   'project-saved'   – the project was successfully saved to file
 *   'chart-generated' – the SVG chart was (re)generated
 */

const listeners = {};

/**
 * Register a listener for an event.
 * @param {string} event
 * @param {Function} fn
 */
export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
}

/**
 * Remove a previously registered listener.
 * @param {string} event
 * @param {Function} fn
 */
export function off(event, fn) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(f => f !== fn);
}

/**
 * Emit an event, calling all registered listeners with the given data.
 * @param {string} event
 * @param {*} data
 */
export function emit(event, data) {
  if (!listeners[event]) return;
  for (const fn of listeners[event]) {
    fn(data);
  }
}
