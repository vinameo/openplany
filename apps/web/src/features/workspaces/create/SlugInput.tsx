import { useRef, type ChangeEvent, type ClipboardEvent } from "react";
import { Input, type InputWrapperProps } from "@mantine/core";
import classes from "./SlugInput.module.css";

const currentHost =
  typeof window !== "undefined" && window.location?.host
    ? window.location.host
    : "localhost:5173";

interface SlugInputProps
  extends Omit<InputWrapperProps, "children" | "onChange"> {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
  spellCheck?: boolean;
  autoCapitalize?: string;
  inputStatusId?: string;
}

export function SlugInput({
  label,
  description,
  error,
  withAsterisk,
  value,
  onChange,
  onPaste,
  readOnly,
  maxLength = 48,
  placeholder = "Type or paste a URL",
  autoComplete = "off",
  spellCheck = false,
  autoCapitalize = "none",
  inputStatusId,
  ...wrapperProps
}: SlugInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handlePrefixClick() {
    inputRef.current?.focus();
  }

  const describedBy = [
    description ? `${wrapperProps.id ?? "slug"}-description` : null,
    inputStatusId,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Input.Wrapper
      label={label}
      description={description}
      error={error}
      withAsterisk={withAsterisk}
      {...wrapperProps}
    >
      <div
        className={`${classes.box} ${error ? classes.boxError : ""}`}
        onClick={handlePrefixClick}
      >
        <span
          className={classes.prefix}
          title={`${currentHost}/`}
        >{`${currentHost}/`}</span>
        <Input
          ref={inputRef}
          variant="unstyled"
          className={classes.input}
          value={value}
          onChange={onChange}
          onPaste={onPaste}
          readOnly={readOnly}
          maxLength={maxLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck={spellCheck}
          autoCapitalize={autoCapitalize}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy || undefined}
        />
      </div>
    </Input.Wrapper>
  );
}

