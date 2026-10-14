import { Outlet, type RouteObject } from "react-router";
import { ForgotPasswordRoute } from "./features/auth/routes/ForgotPasswordRoute";
import { RequireAuth } from "./features/auth/routes/RequireAuth";
import { SetPasswordRoute } from "./features/auth/routes/SetPasswordRoute";
import { SignInRoute } from "./features/auth/routes/SignInRoute";
import {
  FORGOT_PASSWORD_PATH,
  HOME_PATH,
  SET_PASSWORD_PATH,
  SIGN_IN_PATH,
} from "./features/auth/sessionDestination";
import { HomePage } from "./features/home/HomePage";
import { CreateUserRoute } from "./features/admin/users/CreateUserRoute";
import { RolesAndPermissionsRoute } from "./features/admin/roles/RolesAndPermissionsRoute";
import { ROLES_AND_PERMISSIONS_PATH } from "./features/admin/roles/rolesOverview";
import { CreateWorkspaceRoute } from "./features/workspaces/create/CreateWorkspaceRoute";
import { HomeIcon } from "./features/workspaces/icons";
import { HomeRedirect } from "./features/workspaces/routes/HomeRedirect";
import { WorkspaceLayout } from "./features/workspaces/routes/WorkspaceLayout";
import { WorkspaceNotFound } from "./features/workspaces/routes/WorkspaceNotFound";
import { WorkspaceChrome } from "./features/workspaces/shell/WorkspaceChrome";
import { WorkspaceShell } from "./features/workspaces/shell/WorkspaceShell";
import type { WorkspacePageHandle } from "./features/workspaces/shell/workspacePageHandle";
import { WorkspaceProvider } from "./features/workspaces/WorkspaceProvider";
import { ServerStateProvider } from "./lib/ServerStateProvider";
import { ProjectLayout } from "./features/projects/detail/ProjectLayout";
import { ProjectShell } from "./features/projects/detail/ProjectShell";
import { ProjectHomePage } from "./features/projects/detail/ProjectHomePage";
import type { ProjectPageHandle } from "./features/projects/detail/projectPageHandle";
import type { SettingsSectionHandle } from "./features/settings/settingsSectionHandle";

export const appRoutes: RouteObject[] = [
  {
    element: (
      <ServerStateProvider>
        <Outlet />
      </ServerStateProvider>
    ),
    children: [
      { path: SIGN_IN_PATH, element: <SignInRoute /> },
      { path: SET_PASSWORD_PATH, element: <SetPasswordRoute /> },
      { path: FORGOT_PASSWORD_PATH, element: <ForgotPasswordRoute /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: (
              <WorkspaceProvider>
                <Outlet />
              </WorkspaceProvider>
            ),
            children: [
              { path: HOME_PATH, element: <HomeRedirect /> },
              { path: "/create-workspace", element: <CreateWorkspaceRoute /> },
              { path: "/create-user", element: <CreateUserRoute /> },
              {
                path: ROLES_AND_PERMISSIONS_PATH,
                element: <RolesAndPermissionsRoute />,
              },
              {
                path: "/:workspaceSlug",
                element: <WorkspaceLayout />,
                children: [
                  {
                    element: (
                      <WorkspaceChrome>
                        <Outlet />
                      </WorkspaceChrome>
                    ),
                    children: [
                      {
                        element: <WorkspaceShell />,
                        children: [
                          {
                            index: true,
                            element: <HomePage />,
                            handle: {
                              workspacePage: {
                                titleKey: "workspace:shell.home",
                                icon: HomeIcon,
                              },
                            } satisfies WorkspacePageHandle,
                          },
                        ],
                      },
                      {
                        path: "settings",
                        lazy: () =>
                          import("./features/workspaces/settings/settingsRoutes").then(
                            (m) => ({
                              Component: m.WorkspaceSettingsLayout,
                            }),
                          ),
                        children: [
                          {
                            index: true,
                            lazy: () =>
                              import("./features/workspaces/settings/settingsRoutes").then(
                                (m) => ({
                                  Component: m.SettingsIndexRedirect,
                                }),
                              ),
                          },
                          {
                            path: "general",
                            handle: {
                              settingsSection: "general",
                            } satisfies SettingsSectionHandle,
                            lazy: () =>
                              import("./features/workspaces/settings/settingsRoutes").then(
                                (m) => ({
                                  Component: m.GeneralSettingsRoute,
                                }),
                              ),
                          },
                          {
                            path: "members",
                            handle: {
                              settingsSection: "members",
                            } satisfies SettingsSectionHandle,
                            lazy: () =>
                              import("./features/workspaces/settings/settingsRoutes").then(
                                (m) => ({
                                  Component: m.MembersSettingsRoute,
                                }),
                              ),
                          },
                          {
                            path: "*",
                            lazy: () =>
                              import("./features/workspaces/settings/settingsRoutes").then(
                                (m) => ({
                                  Component: m.SettingsSectionNotFound,
                                }),
                              ),
                          },
                        ],
                      },
                    ],
                  },
                  {
                    path: "projects/:projectIdentifier",
                    element: <ProjectLayout />,
                    children: [
                      {
                        element: <ProjectShell />,
                        children: [
                          {
                            index: true,
                            element: <ProjectHomePage />,
                            handle: {
                              projectPage: {
                                titleKey: "workspace:shell.home",
                              },
                            } satisfies ProjectPageHandle,
                          },
                        ],
                      },
                      {
                        path: "settings",
                        lazy: () =>
                          import(
                            "./features/projects/settings/settingsRoutes"
                          ).then((m) => ({
                            Component: m.ProjectSettingsLayout,
                          })),
                        children: [
                          {
                            index: true,
                            lazy: () =>
                              import(
                                "./features/projects/settings/settingsRoutes"
                              ).then((m) => ({
                                Component: m.ProjectSettingsIndexRedirect,
                              })),
                          },
                          {
                            path: "general",
                            handle: {
                              settingsSection: "general",
                            } satisfies SettingsSectionHandle,
                            lazy: () =>
                              import(
                                "./features/projects/settings/settingsRoutes"
                              ).then((m) => ({
                                Component: m.ProjectGeneralSettingsRoute,
                              })),
                          },
                          {
                            path: "members",
                            handle: {
                              settingsSection: "members",
                            } satisfies SettingsSectionHandle,
                            lazy: () =>
                              import(
                                "./features/projects/settings/settingsRoutes"
                              ).then((m) => ({
                                Component: m.ProjectMembersSettingsRoute,
                              })),
                          },
                          {
                            path: "*",
                            lazy: () =>
                              import(
                                "./features/projects/settings/settingsRoutes"
                              ).then((m) => ({
                                Component: m.ProjectSettingsSectionNotFound,
                              })),
                          },
                        ],
                      },
                    ],
                  },
                ],
              },

            ],
          },
        ],
      },
      { path: "*", element: <WorkspaceNotFound /> },
    ],
  },
];
