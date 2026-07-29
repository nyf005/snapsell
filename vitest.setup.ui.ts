import "@testing-library/jest-dom/vitest";

/**
 * Polyfills pointer-events et scroll, absents de jsdom.
 *
 * Les primitives Radix qui s'ouvrent au pointeur — `Select` en particulier —
 * appellent `hasPointerCapture` puis `scrollIntoView` sur la cible du clic. jsdom
 * n'implémente ni l'API Pointer Capture ni le défilement, et l'ouverture du menu
 * lève `target.hasPointerCapture is not a function` avant qu'aucune assertion ne
 * s'exécute. Rien à voir avec le composant testé : sans ces quatre fonctions,
 * aucun `Select` n'est testable.
 */
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
