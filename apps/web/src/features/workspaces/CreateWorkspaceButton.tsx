import { ActionIcon, Button } from "@mantine/core";
import { Link } from "react-router";
import { t } from "i18next";
import { PlusIcon } from "./icons";

export function CreateWorkspaceButton() {
  const label = t("workspace:createButton.label");

  return (
    <>
      <Button
        component={Link}
        to="/create-workspace"
        size="xs"
        variant="filled"
        rightSection={<PlusIcon />}
        visibleFrom="xs"
        styles={{
          root: {
            height: 30,
          },
        }}
      >
        {label}
      </Button>

      <ActionIcon
        component={Link}
        to="/create-workspace"
        size="md"
        variant="filled"
        aria-label={label}
        title={label}
        hiddenFrom="xs"
      >
        <PlusIcon />
      </ActionIcon>
    </>
  );
}

