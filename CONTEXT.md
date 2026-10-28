# OpenPlany

Self-hosted project management for tracking issues. One instance hosts many workspaces; people get accounts from the instance and join workspaces with a role.

## Language

### People and accounts

**User**:
A person's account on this OpenPlany instance, identified by a unique email. Users are created by an instance admin; there is no self sign-up. A User can change their own Profile and password; an instance admin can change a User's name and email and set a new password from the Users page.
_Avoid_: Account

**Profile**:
A User's own personal details that they edit themselves: first name, last name and display name. The email is shown but only an instance admin can change it.
_Avoid_: Account settings, my account

**Account menu**:
The menu that opens from your avatar and name at the top right of every signed-in page. It holds Edit profile, Change password and Sign out.
_Avoid_: User menu, profile menu

**Change password**:
A User replacing their own password from the Account menu. They must type their current password first. Every other place they were signed in is signed out; the device they used stays signed in. Distinct from an instance admin setting a new password on the Users page.
_Avoid_: reset password (reserved for a future email-based flow)

**Sign out**:
Ending your session on this device. Offered only in the Account menu.
_Avoid_: Log out, logout

**Instance admin**:
A User allowed to run the whole instance (create and edit Users, set a User's password, create workspaces, manage roles and permissions). Being an instance admin grants nothing inside a workspace.
_Avoid_: Superuser, god mode, system admin

**Account created date**:
When an instance admin created the User. It never changes. Distinct from Joining date, which belongs to a membership.
_Avoid_: Joining date (for accounts), member since

**Anonymised account**:
A User whose personal details were wiped. They cannot sign in and no longer appear on the Users page.
_Avoid_: masked user, deleted user

**Users page**:
The instance admin's page listing every User of the instance except bots and Anonymised accounts, where they add Users, edit a User's name and email, and set a new password. Setting a new password signs the User out everywhere.
_Avoid_: User management, admin panel

**Re-authentication**:
Typing your own password again to confirm it's you before a sensitive change. Required to set a new password for another Instance admin, and to Change password.
_Avoid_: step-up, sudo mode, confirm identity

### Workspaces

**Workspace**:
The shared space of one team inside the company that runs the instance. A company with several teams has several workspaces; a person who works in two teams is a member of both.
_Avoid_: Organization, company, team space

**Workspace member**:
A User with an active membership in a workspace, holding exactly one workspace role. Covers every role, Admin through Guest.
_Avoid_: "Member" on its own when the role is not meant

**Workspace role**:
The level of trust a workspace member has: Admin, Member or Guest. "Member" here is the role name, distinct from **Workspace member**. Wherever workspace and project roles appear together, the Admin role is written 'Workspace Admin'. The person who creates a workspace becomes its Admin; a workspace may have several Admins and always keeps at least one.
_Avoid_: Owner (the role no longer exists), bare "Admin" next to project roles

**Add member**:
Making an existing User a workspace member, or an existing workspace member a project member, directly, with a chosen role, effective immediately and without the person's consent step. Re-adding a former member restores their membership with the new role only.
_Avoid_: Invite, invitation (reserved for a future email-based flow)

**Joining date**:
When a workspace member's or project member's current membership began. Re-adding a former member starts a new membership and a new joining date.
_Avoid_: Created date, member since

**Member candidate**:
An active, non-bot User found by email while adding members. A candidate who is already a workspace member is shown but cannot be chosen. When adding to a project, candidates are limited to the workspace's members; those already in the project, and Workspace Admins (who can access every project anyway), are shown but cannot be chosen.

**Former member**:
A User who was a workspace member and was removed. Adding them again starts a new membership with the role chosen now; nothing from the earlier membership is restored.
_Avoid_: Deleted member, inactive member

**Deactivated account**:
A User whose account an instance admin has switched off. They cannot sign in, but stay listed as a workspace member and still count toward the member total.
_Avoid_: Inactive member (that would be a Former member)

### Projects and work

**Project**:
One of a team's projects: a place inside one workspace where a group of people track work items together. Every project belongs to exactly one workspace and has a name that is unique within it. A project is private: only its project members and the Workspace Admins can see it; nobody can join one on their own. Members and Guests of the workspace see only the projects they were added to.

**Project ID**:
The short uppercase code of a project, unique within its workspace and never reused there, even after the project is deleted, that prefixes its work items' numbers (for example `OPS-12`). Suggested from the project name when the project is created. It appears in project URLs (`/<workspace>/projects/OPS`).
_Avoid_: Key, prefix, identifier (in user-facing text)

**Project member**:
A workspace member who has been placed in a project with a project role. Only workspace members can be project members. Workspace Admins are never project members. People who can see the workspace's members also see them on every project's member list, as Project Admin through their workspace role; they cannot be changed or removed there. They are not counted among a project's members: a project's member count and the members shown in the project list include only people added to it.
_Avoid_: Participant

**Former project member**:
A person who was a project member and was taken out of the project. Adding them again starts a new project membership with the role chosen now; nothing from the earlier one is restored. This includes a Workspace Admin whose earlier project membership was switched off because Workspace Admins already act as Project Admin everywhere.
_Avoid_: Deleted project member, inactive project member

**Project cover**:
The picture shown at the top of a project, chosen from a fixed set that comes with OpenPlany.
_Avoid_: Banner

**Project timezone**:
The time zone in which a project's dates (due dates, milestone dates, "today") are read. A project follows its workspace's time zone, including later changes to it, until someone sets a time zone for the project itself.

**Delete project**:
Removing a project for everyone at once. Nobody can open it afterwards and OpenPlany offers no way to restore it; its Project ID stays taken, while its name can be given to a new project. Only people allowed to delete projects in the workspace can do it, which by default means Workspace Admins, not Project Admins.
_Avoid_: Archive (a separate, reversible action not offered yet), remove project

**Project home**:
The first page a person lands on when opening a project. Distinct from the workspace's Home, which lists the workspace's projects.
_Avoid_: Project overview, project dashboard

**Work item**:
One unit of work tracked inside a project, whatever its kind. It has a title and a description written in Markdown; projects will later add sections of their own. It is what people create, assign and move through states.
_Avoid_: Issue, ticket

**Work item number**:
The number that identifies a work item, written after its project's Project ID (`OPS-12`). Each project counts from 1 in the order its work items are created; a number is never given twice, even after a work item is deleted.
_Avoid_: ID, key, ticket number

**State**:
A step in a work item's life, such as Backlog or In Progress. Every work item is in exactly one state. A project's states are OpenPlany's five default states, the states its workspace adds, and the states the project adds itself; each level can only change its own states, and nobody can change the defaults.
_Avoid_: Status

**State group**:
One of five fixed kinds every state belongs to: Backlog, Planned, Active, Finished, Cancelled. It tells OpenPlany what a state means, whatever its name.
_Avoid_: Category, type

**Default state**:
One of the five states every project has: Backlog, Todo, In Progress, Done, Cancelled. Their names stay in English in every language, and they cannot be changed or deleted.

### Roles and permissions

**Project access policy**:
For each workspace role: the project role it gives in every project, if any, and the lowest and highest project role a person with it can be given when added to a project. Set by OpenPlany and the same in every workspace; it cannot be changed on the Roles page. By default: Workspace Admins are Project Admin everywhere; Members can be added as Commenter up to Project Admin; Guests only as Viewer.
_Avoid_: Floor, ceiling (in user-facing text)

**Project role**:
The level of trust a person has inside one project: Project Admin, Contributor, Commenter or Viewer. Workspace Admins act as Project Admin in every project. The same person can hold different project roles in different projects of one workspace. A project's lead, in everyday speech, is a Project Admin; a project may have several. A project may be left with no Project Admin other than Workspace Admins; this is allowed, unlike the workspace's Last Admin.
_Avoid_: Project member role, Lead (as a role name), Guest (that word means an outsider at the workspace level)

**Effective project role**:
The project role a person can actually use: the role they were given, capped by what their workspace role allows (a workspace Guest can never act above Viewer), or Project Admin for Workspace Admins. This is the role shown on the project's member list.
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
A role whose permission set can never be changed: Workspace Admin and Project Admin. They always keep their default permissions, so every workspace and project can still be managed.

**Permission guardrail**:
A rule that limits which permissions a role may be given: only same-level permissions, deleting a workspace for Admins only, and view-only permissions for workspace Guests and Viewers.

**Change role**:
Giving a workspace member or a project member a different role. A workspace role change also changes the person's role in every project they are in, following the project access policy; whoever makes the change sees that effect before confirming. In a project, making someone a Project Admin, or taking that away, asks for confirmation; other project role changes apply at once. Nobody can change their own role.
_Avoid_: Promote/demote (fine in prose, not as a term)

**Last Admin**:
The only active Admin left in a workspace. They cannot be demoted or removed, and cannot leave, so the workspace is never left without someone to manage it. Two Admins demoting each other at the same moment cannot both succeed.

## Interface language

OpenPlany supports English (`en`, default) and Vietnamese (`vi`). Interface language is browser-based (stored in `localStorage` under `openplany.language`), reactive across tabs via `storage` events, and passed to the API via the `Accept-Language` request header.

### Vietnamese glossary (Thuật ngữ Tiếng Việt)

When Vietnamese is active, the UI and API errors are localized, while core system domain terms remain verbatim in English:

| Keep in English (Giữ tiếng Anh)                                | Vietnamese Translation (Dịch)                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Workspace, Workspace Admin, Instance admin                     | Project → **Dự án**                                                                                                                        |
| Admin, Member, Guest                                           | Members → **Thành viên**                                                                                                                   |
| Project Admin, Contributor, Commenter, Viewer                  | Settings → **Cài đặt**                                                                                                                     |
| Project ID                                                     | Work item → **Công việc**                                                                                                                  |
| Work item number (dạng `OPS-12`)                               | Title → **Tiêu đề**                                                                                                                        |
| OpenPlany                                                      | Description → **Mô tả**                                                                                                                    |
| 5 default states (Backlog, Todo, In Progress, Done, Cancelled) | State → **Trạng thái**                                                                                                                     |
|                                                                | State group → **Loại**                                                                                                                     |
|                                                                | State groups: Backlog → **Tồn đọng**, Planned → **Chưa bắt đầu**, Active → **Đang làm**, Finished → **Hoàn thành**, Cancelled → **Đã huỷ** |
|                                                                | Create more → **Tạo tiếp**                                                                                                                 |
|                                                                | Joining date → **Ngày tham gia**                                                                                                           |
|                                                                | Permission → **Quyền**                                                                                                                     |
|                                                                | Role → **Vai trò**                                                                                                                         |
|                                                                | Deactivated account → **Đã vô hiệu hoá**                                                                                                   |
|                                                                | Login lockout → **Tạm khoá**                                                                                                               |
|                                                                | Account created → **Ngày tạo tài khoản**                                                                                                   |
|                                                                | Users (trang) → **Người dùng**                                                                                                             |
|                                                                | Profile → **Hồ sơ**                                                                                                                        |
|                                                                | Account menu → **Menu tài khoản**                                                                                                          |
|                                                                | Change password → **Đổi mật khẩu**                                                                                                         |
|                                                                | Set new password → **Đặt mật khẩu mới**                                                                                                    |
|                                                                | Sign out → **Đăng xuất**                                                                                                                   |

All translations address the user politely as "bạn". User-supplied content (such as project names, descriptions, and user names), time zone identifiers, server logs, and logos remain untranslated.
