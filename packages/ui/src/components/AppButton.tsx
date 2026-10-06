import { Button, type ButtonProps, type ElementProps } from "@mantine/core";

export interface AppButtonProps
  extends ButtonProps,
    ElementProps<"button", keyof ButtonProps> {}

export function AppButton(props: AppButtonProps) {
  return <Button size="sm" variant="filled" {...props} />;
}
