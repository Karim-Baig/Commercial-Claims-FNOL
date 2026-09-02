/**
 * Module Federation async boundary for the standalone dev harness.
 *
 * Same constraint as the shell: shared singletons are initialised asynchronously, so
 * the entry chunk must not import react or react-dom statically. Keep this file free
 * of static imports.
 *
 * Note this entry is only used when running the Micro-Frontend on its own at :3001.
 * Inside the Meridian shell the exposed ./ClaimsApp module is consumed directly and
 * this file never executes.
 */
import("./bootstrap");
