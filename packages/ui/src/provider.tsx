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
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme={defaultColorScheme}
    >
      {children}
    </MantineProvider>
  );
}
