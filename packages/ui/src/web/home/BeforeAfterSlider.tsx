"use client";

import {
  useCallback,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cx, focusDark } from "../cx";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons";

export interface BeforeAfterSliderProps {
  before: ReactNode;
  after: ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  /** Accessible name for the handle. */
  label?: string;
  /** Starting position, 0–100 (% of width showing "before"). */
  initial?: number;
  step?: number;
  bigStep?: number;
  onChange?: (value: number) => void;
}

export const clampPct = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/**
 * Before/after comparison (mockup 01 "We can transform your home").
 * The divider is a WAI-ARIA slider: Arrow keys ±step, PageUp/PageDown
 * ±bigStep, Home/End jump to 0/100; pointer drag also works.
 */
export function BeforeAfterSlider({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  label = "Before and after comparison",
  initial = 50,
  step = 5,
  bigStep = 10,
  onChange,
}: BeforeAfterSliderProps) {
  const [value, setValue] = useState(clampPct(initial));
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const update = useCallback(
    (v: number) => {
      const next = clampPct(v);
      setValue(next);
      onChange?.(next);
    },
    [onChange],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number> = {
      ArrowLeft: value - step,
      ArrowDown: value - step,
      ArrowRight: value + step,
      ArrowUp: value + step,
      PageDown: value - bigStep,
      PageUp: value + bigStep,
      Home: 0,
      End: 100,
    };
    if (e.key in map) {
      e.preventDefault();
      update(map[e.key]!);
    }
  };

  const fromPointer = (e: PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    update(((e.clientX - rect.left) / rect.width) * 100);
  };

  return (
    <div
      ref={box}
      className="relative aspect-[16/9] select-none overflow-hidden bg-soft"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <div className="absolute inset-0">{after}</div>
      <div
        data-testid="before-layer"
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - value}% 0 0)` }}
      >
        {before}
      </div>
      <span className="absolute bottom-3 left-3 bg-white px-2 py-0.5 font-subhead text-caption text-ink">
        {beforeLabel}
      </span>
      <span className="absolute bottom-3 right-3 bg-white px-2 py-0.5 font-subhead text-caption text-ink">
        {afterLabel}
      </span>
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white"
        style={{ left: `${value}%` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}% ${beforeLabel.toLowerCase()}`}
        onKeyDown={onKeyDown}
        className={cx(
          "absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-navy text-white shadow-pop",
          focusDark,
        )}
        style={{ left: `${value}%` }}
      >
        <ChevronLeftIcon size={14} />
        <ChevronRightIcon size={14} />
      </div>
    </div>
  );
}
