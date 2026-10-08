import { ActionIcon, CopyButton, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { CheckIcon, CopyIcon } from "../../icons";

interface WorkspaceUrlFieldProps {
  slug: string;
}

export function WorkspaceUrlField({ slug }: WorkspaceUrlFieldProps) {
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
      message: "URL copied",
      color: "green",
      autoClose: 2000,
    });
  }

  return (
    <TextInput
      label="Workspace URL"
      value={displayValue}
      title={displayValue}
      readOnly
      description="Workspace URLs can't be changed."
      rightSection={
        <CopyButton value={fullUrl} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip
              label={copied ? "Copied" : "Copy URL"}
              withArrow
              position="right"
            >
              <ActionIcon
                color={copied ? "teal" : "gray"}
                variant="subtle"
                aria-label="Copy workspace URL"
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

