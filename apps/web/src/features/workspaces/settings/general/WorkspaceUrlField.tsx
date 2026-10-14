import { ActionIcon, CopyButton, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { CheckIcon, CopyIcon } from "../../icons";

interface WorkspaceUrlFieldProps {
  slug: string;
}

export function WorkspaceUrlField({ slug }: WorkspaceUrlFieldProps) {
  const { t } = useTranslation();
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "";
  const host =
    typeof window !== "undefined" && window.location?.host
      ? window.location.host
      : "";

  const fullUrl = `${origin}/${slug}`;
  const displayValue = `${host}/${slug}`;

  function handleCopy(copyFn: () => void) {
    copyFn();
    notifications.show({
      message: t("workspace:settings.general.urlCopied"),
      color: "green",
      autoClose: 2000,
    });
  }

  return (
    <TextInput
      label={t("workspace:settings.general.urlLabel")}
      value={displayValue}
      title={displayValue}
      readOnly
      description={t("workspace:settings.general.urlDescription")}
      rightSection={
        <CopyButton value={fullUrl} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip
              label={copied ? t("common:actions.copied") : t("common:actions.copyUrl")}
              withArrow
              position="right"
            >
              <ActionIcon
                color={copied ? "teal" : "gray"}
                variant="subtle"
                aria-label={t("workspace:settings.general.copyUrlAriaLabel")}
                onClick={() => handleCopy(copy)}
              >
                {copied ? (
                  <CheckIcon width={16} height={16} />
                ) : (
                  <CopyIcon width={16} height={16} />
                )}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      }
    />
  );
}

