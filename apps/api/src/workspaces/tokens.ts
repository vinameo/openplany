export const SLUG_CHECK_LIMITER = Symbol('SLUG_CHECK_LIMITER');
export const WORKSPACE_WRITE_LIMITER = Symbol('WORKSPACE_WRITE_LIMITER');
export const MEMBER_CANDIDATE_LIMITER = Symbol('MEMBER_CANDIDATE_LIMITER');
export const MEMBER_CANDIDATE_ALERT_LIMITER = Symbol(
  'MEMBER_CANDIDATE_ALERT_LIMITER',
);
export const ROLE_CHANGE_PREVIEW_LIMITER = Symbol(
  'ROLE_CHANGE_PREVIEW_LIMITER',
);
export const ROLE_CHANGE_PREVIEW_ALERT_LIMITER = Symbol(
  'ROLE_CHANGE_PREVIEW_ALERT_LIMITER',
);

/** Lets one `workspace.member.role.forbidden` line per actor and window reach the logs. */
export const ROLE_FORBIDDEN_ALERT_LIMITER = Symbol(
  'ROLE_FORBIDDEN_ALERT_LIMITER',
);
