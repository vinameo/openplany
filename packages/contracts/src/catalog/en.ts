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
    "language.buttonAriaLabel": "Language: English (EN)",
    "test.minute_one": "{{count}} minute",
    "test.minute_other": "{{count}} minutes",
  },
  auth: {
    signIn: "Sign in",
    "signIn.title": "Sign in to OpenPlany",
    "signIn.subtitle": "Plan projects and docs in one place.",
    "signIn.email": "Email",
    "signIn.password": "Password",
    "signIn.emailPlaceholder": "name@company.com",
    "signIn.passwordPlaceholder": "Enter your password",
    "signIn.hidePassword": "Hide password",
    "signIn.showPassword": "Show password",
    "signIn.forgotPassword": "Forgot password?",
    "signIn.submit": "Sign in",
    "signIn.tryAgainIn": "Try again in {{time}}",
    "signIn.documentTitle": "Sign in · OpenPlany",
    "forgotPassword.title": "Forgot your password?",
    "forgotPassword.body":
      "Password reset by email isn't available yet. Ask your admin to reset your password.",
    "forgotPassword.backToSignIn": "Back to sign in",
    "forgotPassword.documentTitle": "Forgot password · OpenPlany",
    "setPassword.title": "Set a new password",
    "setPassword.subtitle":
      "Your password has to be changed before you continue.",
    "setPassword.body":
      "Changing it here isn't available yet. Ask your admin to reset your password.",
    "setPassword.backToSignIn": "Back to sign in",
    "setPassword.documentTitle": "Set a new password · OpenPlany",
    "errors.signInFailed": "Couldn't sign in. Please try again.",
    "errors.invalidEmail": "Enter a valid email",
    "errors.passwordRequired": "Enter your password",
    "errors.passwordTooLong": "Password is too long",
    "errors.invalidCredentials": "Incorrect email or password",
    "errors.accountDeactivated":
      "Your account is deactivated. Contact your admin.",
    "errors.ssoRequired": "Sign in with your organization's SSO",
    "errors.tooManyAttempts_one":
      "Too many attempts. Try again in {{count}} minute.",
    "errors.tooManyAttempts_other":
      "Too many attempts. Try again in {{count}} minutes.",
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
