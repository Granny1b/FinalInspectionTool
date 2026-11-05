import { createContext, useContext } from 'react';

/** The scale FittedPages draws the sheets at on screen: 1 when they fit, and always on paper. */
export const FitScaleContext = createContext(1);

/**
 * The scale the sheets around this component are drawn at on screen. For what needs laying out
 * again when it changes: Chrome lays SVG text out for the scale it is drawn at, and doesn't redo
 * it when only an HTML ancestor's transform changes (the Insights report's chart keys on it).
 */
export function useFitScale(): number {
  return useContext(FitScaleContext);
}
