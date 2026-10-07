import { useRef, useState, type FormEvent } from "react";
import { Anchor, Button, PasswordInput, Text, TextInput } from "@mantine/core";
import { ApiRequestError, GENERIC_SIGN_IN_ERROR } from "./api/authApi";
import { AuthLayout } from "./AuthLayout";
import { formatCountdown, useCountdown } from "./useCountdown";
import classes from "./LoginPage.module.css";

export interface LoginValues {
  email: string;
  password: string;
}

interface LoginPageProps {
  /**
   * Performs the sign-in. Reject with an ApiRequestError to get field errors,
   * the 429 countdown and password reset; any other Error shows its message.
   */
  onSubmit: (values: LoginValues) => Promise<void>;
  forgotPasswordHref?: string;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

const inputClassNames = {
  label: classes.label,
  required: classes.required,
  input: classes.input,
  innerInput: classes.innerInput,
  section: classes.section,
  error: classes.fieldError,
};

export function LoginPage({
  onSubmit,
  forgotPasswordHref = "/forgot-password",
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [lockoutMessage, setLockoutMessage] = useState("");
  const lockout = useCountdown();
  const passwordRef = useRef<HTMLInputElement>(null);

  const isLockedOut = lockout.remainingSeconds > 0;
  const canSubmit = email.trim() !== "" && password !== "" && !isLockedOut;

  function showError(error: unknown) {
    if (!(error instanceof ApiRequestError)) {
      setFormError(
        error instanceof Error && error.message !== ""
          ? error.message
          : GENERIC_SIGN_IN_ERROR,
      );
      return;
    }

    if (error.code === "VALIDATION_ERROR") {
      const { email: emailError, password: passwordError } = error.fields;
      setFieldErrors({ email: emailError, password: passwordError });
      if (emailError === undefined && passwordError === undefined) {
        setFormError(error.message);
      }
      return;
    }
    if (
      error.code === "TOO_MANY_ATTEMPTS" &&
      error.retryAfterSeconds !== null
    ) {
      setLockoutMessage(error.message);
      lockout.start(error.retryAfterSeconds);
      return;
    }
    setFormError(error.message);
    if (error.status === 401 || error.status === 403) {
      // Keep the email, make retyping the password the obvious next step.
      setPassword("");
      passwordRef.current?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);
    setFieldErrors({});
    try {
      await onSubmit({ email: email.trim(), password });
    } catch (error: unknown) {
      showError(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  // The alert is read once; the ticking countdown lives on the button so
  // screen readers are not interrupted every second.
  const alertMessage = isLockedOut ? lockoutMessage : formError;

  return (
    <AuthLayout
      title="Sign in to OpenPlany"
      subtitle="Plan projects and docs in one place."
    >
      <form
        className={classes.form}
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        <TextInput
          label="Email"
          placeholder="name@company.com"
          type="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          error={fieldErrors.email}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            setFieldErrors((errors) => ({ ...errors, email: undefined }));
          }}
          classNames={inputClassNames}
        />

        <div className={classes.passwordField}>
          <PasswordInput
            ref={passwordRef}
            label="Password"
            placeholder="Enter your password"
            autoComplete="current-password"
            required
            value={password}
            visible={isPasswordVisible}
            onVisibilityChange={setIsPasswordVisible}
            // Reachable by Tab (web-spec 6) and named for screen readers.
            visibilityToggleFocusable
            visibilityToggleButtonProps={{
              "aria-label": isPasswordVisible
                ? "Hide password"
                : "Show password",
            }}
            error={fieldErrors.password}
            onChange={(event) => {
              setPassword(event.currentTarget.value);
              setFieldErrors((errors) => ({ ...errors, password: undefined }));
            }}
            classNames={{
              ...inputClassNames,
              input: `${classes.input} ${classes.passwordBox}`,
              visibilityToggle: classes.visibilityToggle,
            }}
          />
          {/* After the input in DOM so Tab goes email → password → eye → this link. */}
          <Anchor href={forgotPasswordHref} className={classes.forgotLink}>
            Forgot password?
          </Anchor>
        </div>

        {alertMessage !== null && (
          <Text role="alert" className={classes.formError}>
            {alertMessage}
          </Text>
        )}

        <Button
          type="submit"
          fullWidth
          disabled={!canSubmit}
          loading={isSubmitting}
          className={classes.submit}
        >
          {isLockedOut
            ? `Try again in ${formatCountdown(lockout.remainingSeconds)}`
            : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}
