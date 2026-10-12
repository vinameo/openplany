import type { ComponentType, ReactNode, SVGProps } from "react";
import { Alert, Text } from "@mantine/core";
import classes from "./SettingsSectionFrame.module.css";

export interface SettingsSectionFrameProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  allowed: boolean;
  children: ReactNode;
}

export function SettingsSectionFrame({
  icon: Icon,
  label,
  allowed,
  children,
}: SettingsSectionFrameProps) {
  return (
    <>
      <div className={classes.sectionHeader}>
        <Icon width={16} height={16} />
        <Text className={classes.sectionTitle}>{label}</Text>
      </div>
      <div className={classes.sectionBody}>
        {allowed ? (
          children
        ) : (
          <Alert color="red" title="Access Denied" role="alert">
            You don't have access to this page.
          </Alert>
        )}
      </div>
    </>
  );
}
