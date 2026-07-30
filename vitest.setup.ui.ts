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

/**
 * `ResizeObserver`, même raison.
 *
 * Recharts mesure son conteneur avant de dessiner. jsdom ne fournit pas
 * l'observateur, et tout écran contenant un graphique — l'accueil, la
 * consommation — échouait sur `ResizeObserver is not defined` avant même le
 * premier rendu. Les dimensions restent à zéro, ce qui n'a pas d'importance :
 * on teste ce que le composant décide d'afficher, pas sa mise en page.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
