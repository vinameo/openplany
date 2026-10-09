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
A User with an active membership in a workspace, holding exactly one workspace role. Covers every role, Owner through Guest.
_Avoid_: "Member" on its own when the role is not meant

**Workspace role**:
The level of trust a workspace member has: Owner, Admin, Member or Guest. "Member" here is the role name, distinct from **Workspace member**.

**Add member**:
Making an existing User a workspace member directly, with a chosen role, effective immediately and without the User's consent step. Re-adding a former member restores their membership with the new role only.
_Avoid_: Invite, invitation (reserved for a future email-based flow)

**Member candidate**:
An active, non-bot User found by email while adding members. A candidate who is already a workspace member is shown but cannot be chosen.
