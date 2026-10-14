export const en = {
  common: {
    "roles.workspace.admin": "Admin",
    "roles.workspace.member": "Member",
    "roles.workspace.guest": "Guest",
    "roles.workspace.qualified.admin": "Workspace Admin",
    "roles.workspace.qualified.member": "Member",
    "roles.workspace.qualified.guest": "Guest",
    "roles.workspace.summary.admin":
      "Everything: settings, members, projects and deleting the workspace; access to every project",
    "roles.workspace.summary.member":
      "Work in the projects they join; join public projects",
    "roles.workspace.summary.guest": "View-only access",
    "roles.project.admin": "Project Admin",
    "roles.project.contributor": "Contributor",
    "roles.project.commenter": "Commenter",
    "roles.project.viewer": "Viewer",
    "roles.project.summary.admin":
      "Everything in the project, including settings and members",
    "roles.project.summary.contributor":
      "Create and edit work; delete what they created",
    "roles.project.summary.commenter": "View everything, comment and react",
    "roles.project.summary.viewer": "View-only access",
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
    nothingToUpdate: "Nothing to update",
    foreignKeyViolation: "Foreign key violation",
    invalidTimezone: "Select a valid timezone",
    forbidden: "You don't have permission to do this",
    notFound: "Not found",
    userNotFound: "User not found",
    originNotAllowed: "Origin not allowed",
    passwordResetRequired: "Password reset required",
    sessionExpired: "Session expired",
    slugAlreadyExists: "A workspace with this URL already exists",
    emailAlreadyExists: "A user with this email already exists.",
    rolePermissionsChanged:
      "Permissions have been updated. Refresh the page to see the latest settings.",
    roleUnchanged: "Role is unchanged",
    lastAdmin:
      "A workspace needs at least one Admin. Make someone else an Admin first.",
    roleInherited:
      "Workspace Admins are Project Admins in every project.",
    tooManyAttempts: "Too many attempts. Try again later.",
    tooManyUsersCreated_one:
      "Too many users created. Try again in {{count}} minute.",
    tooManyUsersCreated_other:
      "Too many users created. Try again in {{count}} minutes.",
    tooManyUsersCreatedLater: "Too many users created. Try again later.",
    tooManyRolePermissionUpdates:
      "Too many role permission updates. Try again later.",
    tooManyWorkspaceWrites: "Too many changes. Try again later.",
    memberUserIdParam: "Enter a valid member ID",
    "http.validationError": "Validation failed",
    "http.unauthenticated": "Sign in to continue",
    "http.notFound": "Not found",
    "http.internalError": "Something went wrong",
  },
  workspace: {
    title: "Workspace",
    "errors.nameRequired": "Enter a workspace name",
    "errors.nameTooLong":
      "Workspace name must be {{max}} characters or fewer",
    "errors.nameHiddenChars": "Contains characters that aren't allowed",
    "errors.nameUrl": "Workspace name cannot contain a URL",
    "errors.slugRequired": "Enter a workspace URL",
    "errors.slugReserved": "This URL is reserved. Choose another one.",
    "errors.slugPattern":
      "URL can use only lowercase letters, numbers, and single hyphens, and can't start or end with a hyphen",
    "errors.slugLength": "URL must be between {{min}} and {{max}} characters",
    "errors.orgSizeRequired":
      "Select how many people will use this workspace",
    "errors.orgSizeSelect": "Select a company size",
    "errors.slugTaken": "A workspace with this URL already exists",
    "errors.notFound": "Workspace not found",
    "errors.notAllowed": "You don't have permission to do this",
    "errors.cannotCheckSlug":
      "You don't have permission to check workspace slugs",
    "errors.cannotCreate": "You don't have permission to create workspaces",
    "errors.rateLimitSlugCheck":
      "You've checked several URLs recently. Try again later.",
    "errors.rateLimitCreate":
      "You've created several workspaces recently. Try again later.",
    "errors.slugTakenAnother":
      "This URL is already taken. Choose another one.",
    "errors.lastAdmin":
      "A workspace needs at least one Admin. Make someone else an Admin first.",
    "errors.memberGone": "This person is no longer in this workspace.",
  },
  project: {
    title: "Project",
    "errors.nameRequired": "Enter a project name",
    "errors.nameTooLong":
      "Enter a project name (up to {{max}} characters)",
    "errors.hiddenChars": "Contains characters that aren't allowed",
    "errors.descriptionTooLong":
      "Keep the description under {{max}} characters",
    "errors.iconRequired": "Choose an icon",
    "errors.iconColorInvalid": "Use a color like #1A2B3C",
    "errors.coverRequired": "Choose a cover",
    "errors.identifierPattern":
      "Use 1–5 capital letters or digits, starting with a letter",
    "errors.nameTaken": "A project with this name already exists",
    "errors.identifierTaken": "This project ID is already used",
    "errors.notFound": "This project doesn't exist.",
    "errors.forbidden": "You don't have access to this project.",
    "errors.cantChangeRole": "You can't change this person's role",
    "errors.inheritedRole":
      "Workspace Admins are Project Admins in every project.",
    "errors.memberGone": "This person is no longer in this project.",
    "errors.alreadyMember": "Already a member of this project",
    "errors.notInWorkspace": "This person is no longer in this workspace.",
    "errors.unavailable":
      "This person can't be added. Their account may be deactivated.",
    "errors.roleOutOfRange":
      "This role isn't allowed for their workspace role.",
    "errors.workspaceAdmin":
      "Workspace Admins can already access every project.",
    "errors.timezoneInvalid": "Select a valid timezone",
  },
  members: {
    title: "Members",
    "errors.rowDuplicate": "This person is already in another row",
    "errors.candidateQueryTooShort": "Type at least 3 characters",
    "errors.candidateQueryInvalid":
      "Remove special characters from the email",
    "errors.choosePerson": "Choose a person",
    "errors.chooseRole": "Choose a role",
    "errors.addAtLeastOne": "Add at least one person",
    "errors.addAtMost": "Add up to {{max}} people at a time",
    "errors.checkFields": "Check the highlighted fields",
    "errors.notAllowed": "You don't have permission to do this",
    "errors.roleNotAllowed": "You can't assign this role",
    "errors.roleChanged":
      "Their role was just changed by someone else. Review it and try again.",
    "errors.sameRole": "Choose a different role",
    "errors.roleOutOfRange":
      "This role isn't allowed for their workspace role.",
    "errors.someNotAdded": "Some people couldn't be added",
    "errors.tooManySearches": "Too many searches. Try again later.",
    "errors.alreadyMember": "Already a member of this workspace",
    "errors.unavailable":
      "This person can't be added. Their account may be deactivated.",
    truncated: "Showing the first {{shown}} of {{total}} members.",
    projectTruncated:
      "Showing the first {{shown}} of {{total}} project members.",
  },
  users: {
    "errors.firstNameRequired": "Enter a first name",
    "errors.firstNameTooLong":
      "First name must be {{max}} characters or fewer",
    "errors.lastNameTooLong":
      "Last name must be {{max}} characters or fewer",
    "errors.lastNameText": "Last name must be text",
    "errors.displayNameRequired": "Enter a display name",
    "errors.displayNameTooLong":
      "Display name must be {{max}} characters or fewer",
    "errors.passwordLength": "Use {{min}} to {{max}} characters",
    "errors.emailValid": "Enter a valid email",
    "errors.emailTaken": "A user with this email already exists",
    "errors.enterYourFirstName": "Enter your first name",
    "errors.passwordSameAsEmail": "Password can't be the same as the email",
    "errors.hiddenChars": "Contains characters that aren't allowed",
  },
  admin: {
    title: "Admin",
    "errors.cannotCreateUsers": "You don't have permission to create users",
    "errors.createUserFailed": "Couldn't create user. Please try again.",
    "errors.loadRolesFailed": "Couldn't load roles and permissions.",
    "errors.updateRolesFailed": "Couldn't save permissions. Please try again.",
    "errors.roleLocked":
      "This role always has its default permissions and can't be changed",
    "errors.adminOnly": "Only Admins can have this permission",
    "errors.guestViewOnly": "Guests and Viewers can only view",
    "errors.unknownPermission": "Unknown permission",
    "errors.scopeMismatch": "Scope mismatch",
    "errors.unknownRole": "Unknown role",
    "errors.listedMoreThanOnce": "Listed more than once",
    "errors.conflictReload":
      "Someone else changed these permissions. Reload to see the latest.",
    "errors.tooManyUpdates": "Too many updates. Try again later.",
    "errors.tooManyUsers_one":
      "Too many users created. Try again in {{count}} minute.",
    "errors.tooManyUsers_other":
      "Too many users created. Try again in {{count}} minutes.",
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
