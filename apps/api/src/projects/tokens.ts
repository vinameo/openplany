/** Counts failed project lookups (404/403) per user, so Project IDs cannot be enumerated. */
export const PROJECT_LOOKUP_LIMITER = Symbol('PROJECT_LOOKUP_LIMITER');
/** Lets one rate-limit warning per user and window reach the logs. */
export const PROJECT_LOOKUP_ALERT_LIMITER = Symbol(
  'PROJECT_LOOKUP_ALERT_LIMITER',
);
/** Lets one `project.member.role.forbidden` line per actor and window reach the logs. */
export const PROJECT_ROLE_FORBIDDEN_ALERT_LIMITER = Symbol(
  'PROJECT_ROLE_FORBIDDEN_ALERT_LIMITER',
);
