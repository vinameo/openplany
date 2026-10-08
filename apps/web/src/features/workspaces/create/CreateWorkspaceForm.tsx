import {
  Alert,
  Button,
  Loader,
  Select,
  TextInput,
  Title,
} from "@mantine/core";
import { useNavigate } from "react-router";
import { ORGANIZATION_SIZES } from "@repo/contracts";
import classes from "./CreateWorkspaceForm.module.css";
import { SlugInput } from "./SlugInput";
import { useCreateWorkspaceForm } from "./useCreateWorkspaceForm";

export function CreateWorkspaceForm() {
  const navigate = useNavigate();
  const {
    form,
    slugStatus,
    generalError,
    isSubmitting,
    canSubmit,
    handleNameChange,
    handleSlugChange,
    handleSlugPaste,
    handleSubmit,
  } = useCreateWorkspaceForm();

  function handleGoBack() {
    if (typeof window !== "undefined" && (window.history.state?.idx ?? 0) > 0) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }

  // Derive slug error message if unavailable from API or client reservation
  let slugDisplayError = form.errors.slug;
  if (!slugDisplayError && slugStatus.kind === "unavailable") {
    if (slugStatus.reason === "RESERVED") {
      slugDisplayError = "This URL is reserved. Choose another one.";
    } else if (slugStatus.reason === "TAKEN") {
      slugDisplayError = "This URL is already taken. Choose another one.";
    }
  }

  return (
    <div className={classes.container}>
      <Title order={1} className={classes.title}>
        Create your workspace
      </Title>

      <form onSubmit={handleSubmit} className={classes.form}>
        <TextInput
          label="Name your workspace"
          withAsterisk
          placeholder="Something familiar and recognizable is always best."
          maxLength={80}
          autoFocus
          autoComplete="organization"
          value={form.values.name}
          onChange={handleNameChange}
          onBlur={() => form.validateField("name")}
          error={form.errors.name}
          readOnly={isSubmitting}
        />

        <div>
          <SlugInput
            label="Set your workspace's URL"
            withAsterisk
            description="You can't change this URL later."
            value={form.values.slug}
            onChange={handleSlugChange}
            onPaste={handleSlugPaste}
            onBlur={() => form.validateField("slug")}
            error={slugDisplayError}
            readOnly={isSubmitting}
            inputStatusId="slug-status"
          />

          <div
            id="slug-status"
            className={classes.statusWrapper}
            aria-live="polite"
          >
            {slugStatus.kind === "checking" && (
              <span className={classes.statusChecking}>
                <Loader size="xs" /> Checking…
              </span>
            )}
            {slugStatus.kind === "available" && !slugDisplayError && (
              <span className={classes.statusAvailable}>✓ Available</span>
            )}
          </div>
        </div>

        <Select
          label="How many people will use this workspace?"
          withAsterisk
          placeholder="Select a range"
          data={ORGANIZATION_SIZES as unknown as string[]}
          allowDeselect={false}
          searchable={false}
          checkIconPosition="right"
          comboboxProps={{
            withinPortal: false,
            transitionProps: { duration: 0 },
          }}
          value={form.values.organizationSize}
          onChange={(val) => {
            form.setFieldValue(
              "organizationSize",
              (val ?? "") as (typeof ORGANIZATION_SIZES)[number],
            );
          }}
          onBlur={() => form.validateField("organizationSize")}
          error={form.errors.organizationSize}
          readOnly={isSubmitting}
        />

        {generalError && (
          <Alert color="red" title="Error">
            {generalError}
          </Alert>
        )}

        <div className={classes.actions}>
          <Button
            type="submit"
            variant="filled"
            loading={isSubmitting}
            disabled={!canSubmit}
          >
            Create workspace
          </Button>

          <Button
            type="button"
            variant="default"
            onClick={handleGoBack}
            disabled={isSubmitting}
          >
            Go back
          </Button>
        </div>
      </form>
    </div>
  );
}
