import type { ReactNode } from "react";
import { Button, UnstyledButton } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type {
  ProjectCoverKey,
  ProjectIcon as ProjectIconData,
} from "@repo/contracts";
import { projectCover } from "./projectCovers";
import { ProjectIcon } from "./ProjectIcon";
import { ProjectCoverPicker } from "./ProjectCoverPicker";
import { ProjectIconPicker } from "./ProjectIconPicker";
import classes from "./ProjectCoverHeader.module.css";

export interface ProjectCoverHeaderProps {
  coverKey: ProjectCoverKey;
  icon: ProjectIconData;
  onCoverChange?: (key: ProjectCoverKey) => void;
  onIconChange?: (icon: ProjectIconData) => void;
  children?: ReactNode;
  variant: "modal" | "page";
}

export function ProjectCoverHeader({
  coverKey,
  icon,
  onCoverChange,
  onIconChange,
  children,
  variant,
}: ProjectCoverHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className={`${classes.coverHeader} ${classes[variant]}`}>
      <img
        src={projectCover(coverKey).full}
        alt=""
        className={classes.coverImage}
      />
      {children}
      {onIconChange ? (
        <ProjectIconPicker value={icon} onChange={onIconChange}>
          {({ onClick }) => (
            <UnstyledButton
              type="button"
              aria-label={t("project:icons.changeAriaLabel")}
              onClick={onClick}
              className={classes.iconBox}
            >
              <ProjectIcon icon={icon} size={28} />
            </UnstyledButton>
          )}
        </ProjectIconPicker>
      ) : (
        <div className={classes.iconBox}>
          <ProjectIcon icon={icon} size={28} />
        </div>
      )}

      {onCoverChange && (
        <ProjectCoverPicker value={coverKey} onChange={onCoverChange}>
          {({ onClick }) => (
            <Button
              type="button"
              size="xs"
              variant="default"
              onClick={onClick}
              className={classes.changeCoverButton}
            >
              {t("project:covers.changeButton")}
            </Button>
          )}
        </ProjectCoverPicker>
      )}
    </div>
  );
}
