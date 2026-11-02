/**
 * Which pages sit on the sidebar's "chrome" colour instead of the writing surface.
 *
 * The shell paints the whole main area (title bar included) from this one list, and pages set no
 * background of their own. A page with its own `bg-chrome` on a surface-coloured shell leaves a
 * band of the wrong colour above it: that has bitten the library, search, topic and insights
 * pages. To put a new full page on the chrome colour, add its path here and nowhere else.
 */
const CHROME_PAGES = /^\/(settings|shortcuts|library|insights|search|topic)(\/|$)/;

export const isChromePage = (pathname: string): boolean => CHROME_PAGES.test(pathname);
