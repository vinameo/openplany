# OpenPlany

Self-hosted project management for tracking issues. One instance hosts many workspaces; people get accounts from the instance and join workspaces with a role.

## Language

### People and accounts

**User**:
A person's account on this OpenPlany instance, identified by a unique email. Users are created by an instance admin; there is no self sign-up.
_Avoid_: Account, profile

**Instance admin**:
A User allowed to run the whole instance (create Users, create workspaces). Being an instance admin grants nothing inside a workspace.
_Avoid_: Superuser, god mode, system admin

### Workspaces

**Workspace member**:
A User with an active membership in a workspace, holding exactly one workspace role. Covers every role, Admin through Guest.
_Avoid_: "Member" on its own when the role is not meant

**Workspace role**:
The level of trust a workspace member has: Admin, Member or Guest. "Member" here is the role name, distinct from **Workspace member**. The person who creates a workspace becomes its Admin; a workspace may have several Admins and always keeps at least one.
_Avoid_: Owner (the role no longer exists)

**Add member**:
Making an existing User a workspace member directly, with a chosen role, effective immediately and without the User's consent step. Re-adding a former member restores their membership with the new role only.
_Avoid_: Invite, invitation (reserved for a future email-based flow)

**Joining date**:
When a workspace member's current membership began. Re-adding a former member starts a new membership and a new joining date.
_Avoid_: Created date, member since

**Member candidate**:
An active, non-bot User found by email while adding members. A candidate who is already a workspace member is shown but cannot be chosen.

**Former member**:
A User who was a workspace member and was removed. Adding them again starts a new membership with the role chosen now; nothing from the earlier membership is restored.
_Avoid_: Deleted member, inactive member

**Deactivated account**:
A User whose account an instance admin has switched off. They cannot sign in, but stay listed as a workspace member and still count toward the member total.
_Avoid_: Inactive member (that would be a Former member)

### Projects and work

**Work item**:
One unit of work tracked inside a project, whatever its kind. It is what people create, assign and move through states.
_Avoid_: Issue, ticket

### Roles and permissions

**Project role**:
The level of trust a person has inside one project: Project Admin, Contributor, Commenter or Guest. Workspace Admins act as Project Admin in every project.
_Avoid_: Project member role

**Permission**:
One named action a role may take, such as editing workspace settings. Every permission belongs to either the workspace level or the project level.
_Avoid_: Right, capability

**Role permission set**:
The permissions a role currently has on this instance. An instance admin can add or remove permissions; the change applies to every workspace at once.
_Avoid_: Permission scheme

**Default role permissions**:
The role permission sets a new instance starts with.
_Avoid_: Hardcoded permissions

**Locked role**:
A role whose permission set can never be changed: workspace Admin and Project Admin. They always keep their default permissions, so every workspace and project can still be managed.

**Permission guardrail**:
A rule that limits which permissions a role may be given: only same-level permissions, deleting a workspace for Admins only, and view-only permissions for Guests.

**Last Admin**:
The only active Admin left in a workspace. They cannot be demoted or removed, and cannot leave, so the workspace is never left without someone to manage it.
