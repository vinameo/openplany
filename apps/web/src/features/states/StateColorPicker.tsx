import { useCallback, useRef, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { STATE_COLORS } from "@repo/contracts";
import { relativeLuminance } from "../projects/iconColor";
import classes from "./StateColorPicker.module.css";

export interface StateColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function StateColorPicker({
  value,
  onChange,
  disabled = false,
  className,
  "aria-label": ariaLabel,
}: StateColorPickerProps) {
  const { t } = useTranslation();
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (disabled) return;
      let nextIndex: number;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (index + 1) % STATE_COLORS.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex = (index - 1 + STATE_COLORS.length) % STATE_COLORS.length;
      } else {
        return;
      }
      const nextColor = STATE_COLORS[nextIndex]!;
      onChange(nextColor);
      buttonsRef.current[nextIndex]?.focus();
    },
    [disabled, onChange],
  );

  const label = ariaLabel ?? t("state:form.color");

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={className ? classes.picker + " " + className : classes.picker}
    >
      {STATE_COLORS.map((color, index) => {
        const isSelected = color.toLowerCase() === value.toLowerCase();
        const checkColor =
          relativeLuminance(color) > 0.45 ? "#1A1A1A" : "#FFFFFF";

        return (
          <button
            key={color}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label + " " + (index + 1)}
            tabIndex={isSelected || (!value && index === 0) ? 0 : -1}
            disabled={disabled}
            className={
              isSelected
                ? classes.swatch + " " + classes.swatchSelected
                : classes.swatch
            }
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            onKeyDown={(e) => handleKeyDown(e, index)}
          >
            {isSelected && (
              <svg
                width={14}
                height={14}
                viewBox="0 0 16 16"
                fill="none"
                stroke={checkColor}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={classes.indicator}
              >
                <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
