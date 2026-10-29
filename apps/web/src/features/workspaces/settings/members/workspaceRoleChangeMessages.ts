import { translate } from "../../../../i18n";

export function confirmTitle(name: string, label: string): string {
  return translate("members:roleChange.confirmTitle", { name, role: label });
}

export function gainImplicit(name: string): string {
  return translate("members:roleChange.gainImplicit", { name });
}

export function rolesReplaced(n: number): string {
  return translate("members:roleChange.rolesReplaced", { count: n });
}

export function loseImplicit(name: string, n: number): string {
  return translate("members:roleChange.loseImplicit", { name, count: n });
}

export function inProjects(name: string, n: number): string {
  return translate("members:roleChange.inProjects", { name, count: n });
}

export function noProjects(name: string): string {
  return translate("members:roleChange.noProjects", { name });
}

export function onlyAdminsChoose(roleLabel: string): string {
  return translate("members:roleChange.onlyAdminsChoose", { role: roleLabel });
}

export function losingAdminWarning(): string {
  return translate("members:roleChange.losingAdminWarning");
}

export function previewFailed(): string {
  return translate("members:roleChange.previewFailed");
}

export function toastChanged(name: string, label: string, n: number): string {
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  if (n > 0) {
    return translate(
      `members:roleChange.toastChangedWithProjects_${article}` as const,
      {
        name,
        role: label,
        count: n,
      },
    );
  }
  return translate(`members:roleChange.toastChanged_${article}` as const, {
    name,
    role: label,
  });
}
