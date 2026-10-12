import { Alert, Button, Group } from "@mantine/core";

export function ProjectLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert color="red" title="Error" radius="md">
      Couldn&apos;t load this project.
      <Group mt="md">
        <Button variant="default" size="xs" onClick={onRetry}>
          Retry
        </Button>
      </Group>
    </Alert>
  );
}
