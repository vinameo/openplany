import { ActionIcon, Button } from "@mantine/core";
import { Link } from "react-router";
import { PlusIcon } from "./icons";

export function CreateWorkspaceButton() {
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
        Create workspace
      </Button>

      <ActionIcon
        component={Link}
        to="/create-workspace"
        size="md"
        variant="filled"
        aria-label="Create workspace"
        title="Create workspace"
        hiddenFrom="xs"
      >
        <PlusIcon />
      </ActionIcon>
    </>
  );
}

