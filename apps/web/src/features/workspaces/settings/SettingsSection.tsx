import { type ReactNode } from "react";
import { Box, Paper, Text } from "@mantine/core";
import classes from "./SettingsSection.module.css";

interface SettingsSectionProps {
  title?: string;
  description?: string;
  variant?: "default" | "danger";
  children?: ReactNode;
}

export function SettingsSection({
  title,
  description,
  variant = "default",
  children,
}: SettingsSectionProps) {
  const isDanger = variant === "danger";

  return (
    <Paper
      withBorder
      radius="md"
      p="lg"
      className={`${classes.section} ${isDanger ? classes.danger : ""}`}
    >
      {(title || description) && (
        <Box mb="md">
          {title && (
            <Text
              className={`${classes.title} ${isDanger ? classes.dangerTitle : ""}`}
            >
              {title}
            </Text>
          )}
          {description && (
            <Text className={classes.description}>{description}</Text>
          )}
        </Box>
      )}
      {children}
    </Paper>
  );
}

