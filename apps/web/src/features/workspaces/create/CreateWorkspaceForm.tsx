import {
  Alert,
  Button,
  Loader,
  Select,
  TextInput,
  Title,
} from "@mantine/core";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ORGANIZATION_SIZES, ORGANIZATION_SIZE_KEYS } from "@repo/contracts";
import classes from "./CreateWorkspaceForm.module.css";
import { SlugInput } from "./SlugInput";
import { useCreateWorkspaceForm } from "./useCreateWorkspaceForm";

export function CreateWorkspaceForm() {
  const { t } = useTranslation();
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
      slugDisplayError = t("workspace:create.errors.slugReserved");
    } else if (slugStatus.reason === "TAKEN") {
      slugDisplayError = t("workspace:create.errors.slugTaken");
    }
  }

  const organizationSizeOptions = ORGANIZATION_SIZES.map((size) => ({
    value: size,
    label: t(ORGANIZATION_SIZE_KEYS[size]),
  }));

  return (
    <div className={classes.container}>
      <Title order={1} className={classes.title}>
        {t("workspace:create.title")}
      </Title>

      <form onSubmit={handleSubmit} className={classes.form}>
        <TextInput
          label={t("workspace:create.nameLabel")}
          withAsterisk
          placeholder={t("workspace:create.namePlaceholder")}
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
            label={t("workspace:create.slugLabel")}
            withAsterisk
            description={t("workspace:create.slugDescription")}
            placeholder={t("workspace:create.slugPlaceholder")}
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
                <Loader size="xs" /> {t("workspace:create.slugChecking")}
              </span>
            )}
            {slugStatus.kind === "available" && !slugDisplayError && (
              <span className={classes.statusAvailable}>
                {t("workspace:create.slugAvailable")}
              </span>
            )}
          </div>
        </div>

        <Select
          label={t("workspace:create.orgSizeLabel")}
          withAsterisk
          placeholder={t("workspace:create.orgSizePlaceholder")}
          data={organizationSizeOptions}
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
          <Alert color="red" title={t("common:error")}>
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
            {t("workspace:create.submitButton")}
          </Button>

          <Button
            type="button"
            variant="default"
            onClick={handleGoBack}
            disabled={isSubmitting}
          >
            {t("workspace:create.goBackButton")}
          </Button>
        </div>
      </form>
    </div>
  );
}

