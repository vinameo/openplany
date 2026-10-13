import type { ComponentType, SVGProps } from "react";

export interface SettingsSection<P extends string = string> {
  key: string;
  group: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Missing = everyone can view. */
  viewPermission?: P;
  /** Item is in sidebar but has no page yet: "Coming soon", no link, no route. */
  comingSoon?: true;
}

export interface SettingsGroup {
  key: string;
  label: string;
}

export interface SettingsNavigationGroup<P extends string = string> {
  key: string;
  label: string;
  sections: SettingsSection<P>[];
}

export interface BuildSettingsNavigationInput<P extends string> {
  sections: readonly SettingsSection<P>[];
  groups: readonly SettingsGroup[];
  /** null = unknown yet (loading): show all items as if viewer has full permissions. */
  permissions: readonly P[] | null;
  /** Active section key from useSettingsSectionKey(). */
  activeKey: string | null;
}

export function buildSettingsNavigation<P extends string>(
  input: BuildSettingsNavigationInput<P>,
): {
  groups: SettingsNavigationGroup<P>[];
  activeKey: string | null;
} {
  const { sections, groups, permissions, activeKey } = input;

  const visible = sections.filter((s) => {
    if (permissions === null) return true;
    return !s.viewPermission || permissions.includes(s.viewPermission);
  });

  const groupKeySet = new Set(groups.map((g) => g.key));
  for (const s of visible) {
    if (!groupKeySet.has(s.group)) {
      throw new Error(
        `Section "${s.key}" belongs to unknown group "${s.group}"`,
      );
    }
  }

  const resultGroups: SettingsNavigationGroup<P>[] = [];
  for (const group of groups) {
    const groupSections = visible.filter((s) => s.group === group.key);
    if (groupSections.length > 0) {
      resultGroups.push({
        key: group.key,
        label: group.label,
        sections: groupSections,
      });
    }
  }

  let resolvedActiveKey: string | null = null;
  if (activeKey !== null) {
    const match = visible.find((s) => s.key === activeKey);
    if (match && !match.comingSoon) {
      resolvedActiveKey = activeKey;
    }
  }

  return { groups: resultGroups, activeKey: resolvedActiveKey };
}

/** First section with an active page that viewer can open (for index redirect). */
export function firstOpenableSection<P extends string>(
  sections: readonly SettingsSection<P>[],
  permissions: readonly P[],
): SettingsSection<P> | null {
  for (const s of sections) {
    if (s.comingSoon) continue;
    if (!s.viewPermission || permissions.includes(s.viewPermission)) {
      return s;
    }
  }
  return null;
}
