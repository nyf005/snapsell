"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "~/lib/utils";

interface AnimateOnScrollProps {
  children: ReactNode;
  className?: string;
  /** Animation variant applied when element enters viewport */
  animation?: "fade-up" | "fade-in" | "slide-left" | "slide-right" | "scale-in";
  /** Delay in ms before animation starts (useful for stagger) */
  delay?: number;
  /** IntersectionObserver threshold (0-1). Default: 0.15 */
  threshold?: number;
  /** Whether to animate only once or every time element enters viewport */
  once?: boolean;
}

export function AnimateOnScroll({
  children,
  className,
  animation = "fade-up",
  delay = 0,
  threshold = 0.15,
  once = true,
}: AnimateOnScrollProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect prefers-reduced-motion
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReduced) {
      el.classList.add("animate-visible");
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          if (delay > 0) {
            el.style.animationDelay = `${delay}ms`;
          }
          el.classList.add("animate-visible");
          if (once) observer.unobserve(el);
        } else if (!once) {
          el.classList.remove("animate-visible");
        }
      },
      { threshold },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay, threshold, once]);

  return (
    <div
      ref={ref}
      className={cn(`animate-on-scroll animate-${animation}`, className)}
    >
      {children}
    </div>
  );
}

/**
 * Lightweight wrapper for hero elements that animate immediately on page load
 * (no IntersectionObserver, pure CSS animation with delay).
 */
export function AnimateEntrance({
  children,
  className,
  delay = 0,
  animation = "fade-up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  animation?: "fade-up" | "fade-in" | "scale-in";
}) {
  return (
    <div
      className={cn(`animate-entrance animate-${animation}`, className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
