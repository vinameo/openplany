export function confirmTitle(name: string, label: string): string {
  return `Change ${name}'s role to ${label}?`;
}

export function gainImplicit(name: string): string {
  return `As a Workspace Admin, ${name} will be a Project Admin in every project of this workspace, including private ones.`;
}

export function rolesReplaced(n: number): string {
  return `Their roles in ${n} ${n === 1 ? "project" : "projects"} will be replaced.`;
}

export function loseImplicit(name: string, n: number): string {
  return `${name} will lose access to all ${n} ${n === 1 ? "project" : "projects"} until someone adds them back.`;
}

export function inProjects(name: string, n: number): string {
  return `${name} is in ${n} ${n === 1 ? "project" : "projects"}.`;
}

export function noProjects(name: string): string {
  return `${name} isn't in any projects yet.`;
}

export function onlyAdminsChoose(roleLabel: string): string {
  return `Only Workspace Admins can choose this. They'll be ${roleLabel} in every project.`;
}

export const losingAdminWarning =
  "These projects will have no Project Admin other than Workspace Admins:";

export const previewFailed = "Couldn't check what this change affects.";

export function toastChanged(name: string, label: string, n: number): string {
  const article = /^[aeiou]/i.test(label) ? "an" : "a";
  const base = `${name} is now ${article} ${label}.`;
  if (n > 0) {
    return `${base} Applied to ${n} ${n === 1 ? "project" : "projects"}.`;
  }
  return base;
}
