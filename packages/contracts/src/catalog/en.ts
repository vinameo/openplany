export const en = {
  common: {
    "roles.workspace.admin": "Admin",
    "roles.workspace.member": "Member",
    "roles.workspace.guest": "Guest",
    "roles.project.admin": "Project Admin",
    "roles.project.contributor": "Contributor",
    "roles.project.commenter": "Commenter",
    "roles.project.viewer": "Viewer",
    "theme.switchToLight": "Switch to light mode",
    "theme.switchToDark": "Switch to dark mode",
    "test.minute_one": "{{count}} minute",
    "test.minute_other": "{{count}} minutes",
  },
  auth: {
    signIn: "Sign in",
    "errors.signInFailed": "Couldn't sign in. Please try again.",
  },
  errors: {
    genericError: "Something went wrong. Please try again.",
    invalidValue: "Check the highlighted fields",
    validationFailed: "Validation failed",
    checkHighlightedFields: "Check the highlighted fields",
    foreignKeyViolation: "Foreign key violation",
    "http.validationError": "Validation failed",
    "http.unauthenticated": "Sign in to continue",
    "http.notFound": "Not found",
    "http.internalError": "Something went wrong",
  },
  workspace: {
    title: "Workspace",
  },
  project: {
    title: "Project",
  },
  members: {
    title: "Members",
  },
  admin: {
    title: "Admin",
    "errors.createUserFailed": "Couldn't create user. Please try again.",
    "errors.loadRolesFailed": "Couldn't load roles and permissions.",
    "errors.updateRolesFailed": "Couldn't save permissions. Please try again.",
  },
  profile: {
    title: "Profile",
    "errors.saveFailed": "Couldn't save profile. Please try again.",
  },
  permissions: {
    "project.archive": "Archive project",
  },
  permissionGroups: {
    "project.archive": "Project",
  },
} as const;
