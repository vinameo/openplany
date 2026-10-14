import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SidebarExpandButton } from "./SidebarExpandButton";
import { useWorkspacePageMeta } from "./workspacePageHandle";
import headerClasses from "./pageHeader.module.css";
import classes from "./WorkspacePageHeader.module.css";

export function WorkspacePageHeader() {
  const { t } = useTranslation();
  const meta = useWorkspacePageMeta();
  const Icon = meta?.icon;
  const title = meta?.titleKey ? t(meta.titleKey) : meta?.title;

  return (
    <header className={headerClasses.pageHeader}>
      <div className={headerClasses.titleGroup}>
        <SidebarExpandButton />
        {Icon && <Icon width={18} height={18} />}
        {title && <Text className={classes.title}>{title}</Text>}
      </div>
      <div className={classes.actions} />
    </header>
  );
}

