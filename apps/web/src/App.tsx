import { Container, Group, Paper, Stack, Text, Title, Button } from "@mantine/core";
import "./App.css";

function App() {
  async function checkApi() {
    const response = await fetch("/api/health");
    const data = await response.json();

    console.log(data);
    alert(JSON.stringify(data, null, 2));
  }
  return (
    <Container size="md" py="xl">
      <Paper withBorder p="xl" shadow="sm">
        <Stack gap="md">
          <div>
            <Title order={1}>OpenPlany Platform</Title>

            <Text c="dimmed" mt="xs">
              Turborepo + Vite + React + Mantine + NestJS
            </Text>
          </div>

          <Group>
            <Button onClick={checkApi}>Check NestJS API</Button>

            <Button variant="light">Create project</Button>
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}

export default App;
