import { Text } from "@mantine/core";
import { SidebarExpandButton } from "./SidebarExpandButton";
import { useWorkspacePageMeta } from "./workspacePageHandle";
import headerClasses from "./pageHeader.module.css";
import classes from "./WorkspacePageHeader.module.css";

export function WorkspacePageHeader() {
  const meta = useWorkspacePageMeta();
  const Icon = meta?.icon;

  return (
    <header className={headerClasses.pageHeader}>
      <div className={headerClasses.titleGroup}>
        <SidebarExpandButton />
        {Icon && <Icon width={18} height={18} />}
        {meta?.title && <Text className={classes.title}>{meta.title}</Text>}
      </div>
      <div className={classes.actions} />
    </header>
  );
}
