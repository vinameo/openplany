import { type ReactNode } from "react";
import { Box, Paper, Text, Title, type TitleOrder } from "@mantine/core";
import classes from "./SettingsSection.module.css";

interface SettingsSectionProps {
  title?: string;
  titleOrder?: TitleOrder;
  description?: string;
  variant?: "default" | "danger";
  children?: ReactNode;
}

export function SettingsSection({
  title,
  titleOrder,
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
          {title &&
            (titleOrder ? (
              <Title
                order={titleOrder}
                className={`${classes.title} ${isDanger ? classes.dangerTitle : ""}`}
              >
                {title}
              </Title>
            ) : (
              <Text
                className={`${classes.title} ${isDanger ? classes.dangerTitle : ""}`}
              >
                {title}
              </Text>
            ))}
          {description && (
            <Text className={classes.description}>{description}</Text>
          )}
        </Box>
      )}
      {children}
    </Paper>
  );
}


