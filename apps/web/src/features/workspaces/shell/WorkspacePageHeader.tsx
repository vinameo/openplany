import { Text } from "@mantine/core";
import { SidebarExpandButton } from "./SidebarExpandButton";
import { useWorkspacePageMeta } from "./workspacePageHandle";
import classes from "./WorkspacePageHeader.module.css";

export function WorkspacePageHeader() {
  const meta = useWorkspacePageMeta();
  const Icon = meta?.icon;

  return (
    <header className={classes.pageHeader}>
      <div className={classes.titleGroup}>
        <SidebarExpandButton />
        {Icon && <Icon width={18} height={18} />}
        {meta?.title && <Text className={classes.title}>{meta.title}</Text>}
      </div>
      <div className={classes.actions} />
    </header>
  );
}
