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
Making an existing User a workspace member, or an existing workspace member a project member, directly, with a chosen role, effective immediately and without the person's consent step. Re-adding a former member restores their membership with the new role only.
_Avoid_: Invite, invitation (reserved for a future email-based flow)

**Joining date**:
When a workspace member's or project member's current membership began. Re-adding a former member starts a new membership and a new joining date.
_Avoid_: Created date, member since

**Member candidate**:
An active, non-bot User found by email while adding members. A candidate who is already a workspace member is shown but cannot be chosen. When adding to a project, candidates are limited to the workspace's members; those already in the project, and workspace Admins (who can access every project anyway), are shown but cannot be chosen.

**Former member**:
A User who was a workspace member and was removed. Adding them again starts a new membership with the role chosen now; nothing from the earlier membership is restored.
_Avoid_: Deleted member, inactive member

**Deactivated account**:
A User whose account an instance admin has switched off. They cannot sign in, but stay listed as a workspace member and still count toward the member total.
_Avoid_: Inactive member (that would be a Former member)

### Projects and work

**Project**:
A place inside one workspace where a group of people track work items together. Every project belongs to exactly one workspace and has a name that is unique within it. A project is private: only its project members and the workspace's Admins can see it; nobody can join one on their own.

**Project ID**:
The short uppercase code of a project, unique within its workspace and never reused there, even after the project is deleted, that will prefix its work items' numbers (for example `OPS-12`). Suggested from the project name when the project is created. It appears in project URLs (`/<workspace>/projects/OPS`).
_Avoid_: Key, prefix, identifier (in user-facing text)

**Project member**:
A workspace member who has been placed in a project with a project role. Only workspace members can be project members. Workspace Admins can act in every project without being project members, and are not listed as project members unless they were placed in the project.
_Avoid_: Participant

**Former project member**:
A person who was a project member and was taken out of the project. Adding them again starts a new project membership with the role chosen now; nothing from the earlier one is restored.
_Avoid_: Deleted project member, inactive project member

**Project cover**:
The picture shown at the top of a project, chosen from a fixed set that comes with OpenPlany.
_Avoid_: Banner

**Project timezone**:
The time zone in which a project's dates (due dates, milestone dates, "today") are read. A project follows its workspace's time zone, including later changes to it, until someone sets a time zone for the project itself.

**Delete project**:
Removing a project for everyone at once. Nobody can open it afterwards and OpenPlany offers no way to restore it; its Project ID stays taken, while its name can be given to a new project. Only people allowed to delete projects in the workspace can do it, which by default means workspace Admins, not Project Admins.
_Avoid_: Archive (a separate, reversible action not offered yet), remove project

**Project home**:
The first page a person lands on when opening a project. Distinct from the workspace's Home, which lists the workspace's projects.
_Avoid_: Project overview, project dashboard

**Work item**:
One unit of work tracked inside a project, whatever its kind. It is what people create, assign and move through states.
_Avoid_: Issue, ticket

### Roles and permissions

**Project role**:
The level of trust a person has inside one project: Project Admin, Contributor, Commenter or Guest. Workspace Admins act as Project Admin in every project.
_Avoid_: Project member role

**Effective project role**:
The project role a person can actually use: the role they were given, capped by what their workspace role allows (a workspace Guest can never act above project Guest), or Project Admin for workspace Admins. This is the role shown on the project's member list.
_Avoid_: Real role, actual role

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
