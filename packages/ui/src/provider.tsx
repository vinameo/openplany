import type { PropsWithChildren } from "react";
import { MantineProvider, type MantineColorScheme } from "@mantine/core";
import { cssVariablesResolver, theme } from "./theme";

interface AppUiProviderProps extends PropsWithChildren {
  defaultColorScheme?: MantineColorScheme;
}

export function AppUiProvider({
  children,
  defaultColorScheme = "light",
}: AppUiProviderProps) {
  const isTestEnv =
    typeof globalThis !== "undefined" &&
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.NODE_ENV === "test";

  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme={defaultColorScheme}
      env={isTestEnv ? "test" : undefined}
    >
      {children}
    </MantineProvider>
  );
}
