export const en = {
  common: {
    "roles.workspace.admin": "Admin",
    "roles.workspace.member": "Member",
    "roles.workspace.guest": "Guest",
    "roles.project.admin": "Project Admin",
    "roles.project.contributor": "Contributor",
    "roles.project.commenter": "Commenter",
    "roles.project.viewer": "Viewer",
    "test.minute_one": "{{count}} minute",
    "test.minute_other": "{{count}} minutes",
  },
  auth: {
    signIn: "Sign in",
  },
  errors: {
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
  },
  profile: {
    title: "Profile",
  },
  permissions: {
    "project.archive": "Archive project",
  },
  permissionGroups: {
    "project.archive": "Project",
  },
} as const;
