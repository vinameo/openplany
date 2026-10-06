import { useState, type FormEvent } from "react";
import {
  Anchor,
  Button,
  Image,
  PasswordInput,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import markUrl from "../../assets/openplany-mark.png";
import classes from "./LoginPage.module.css";

export interface LoginValues {
  email: string;
  password: string;
}

interface LoginPageProps {
  /**
   * Wire the real sign-in call here. Defaults to a ~1s simulated request.
   * Reject with an Error to show its message above the button.
   */
  onSubmit?: (values: LoginValues) => Promise<void>;
  forgotPasswordHref?: string;
}

const SIMULATED_DELAY_MS = 1000;

function simulateSignIn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, SIMULATED_DELAY_MS);
  });
}

const inputClassNames = {
  label: classes.label,
  required: classes.required,
  input: classes.input,
  innerInput: classes.innerInput,
  section: classes.section,
};

export function LoginPage({
  onSubmit = simulateSignIn,
  forgotPasswordHref = "/forgot-password",
}: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const canSubmit = email.trim() !== "" && password !== "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setFormError(null);
    try {
      await onSubmit({ email: email.trim(), password });
    } catch (error: unknown) {
      setFormError(
        error instanceof Error && error.message !== ""
          ? error.message
          : "Couldn't sign in. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={classes.page}>
      <div className={classes.card}>
        <Image src={markUrl} alt="OpenPlany" className={classes.mark} />

        <Title order={1} className={classes.title}>
          Sign in to OpenPlany
        </Title>
        <Text className={classes.subtitle}>
          Configure instance-wide settings to secure your instance
        </Text>

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
            onChange={(event) => setEmail(event.currentTarget.value)}
            classNames={inputClassNames}
          />

          <div className={classes.passwordField}>
            <PasswordInput
              label="Password"
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
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

          {formError !== null && (
            <Text role="alert" className={classes.formError}>
              {formError}
            </Text>
          )}

          <Button
            type="submit"
            fullWidth
            disabled={!canSubmit}
            loading={isSubmitting}
            className={classes.submit}
          >
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
