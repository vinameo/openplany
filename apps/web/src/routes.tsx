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
import { WorkspaceShell } from "./features/workspaces/shell/WorkspaceShell";
import type { WorkspacePageHandle } from "./features/workspaces/shell/workspacePageHandle";
import { WorkspaceProvider } from "./features/workspaces/WorkspaceProvider";

export const appRoutes: RouteObject[] = [
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
          { path: ROLES_AND_PERMISSIONS_PATH, element: <RolesAndPermissionsRoute /> },
          {
            path: "/:workspaceSlug",
            element: <WorkspaceLayout />,
            children: [
              {
                element: <WorkspaceShell />,
                children: [
                  {
                    index: true,
                    element: <HomePage />,
                    handle: {
                      workspacePage: { title: "Home", icon: HomeIcon },
                    } satisfies WorkspacePageHandle,
                  },
                ],
              },
              {
                path: "settings",
                lazy: () =>
                  import(
                    "./features/workspaces/settings/settingsRoutes"
                  ).then((m) => ({
                    Component: m.WorkspaceSettingsLayout,
                  })),
                children: [
                  {
                    index: true,
                    lazy: () =>
                      import(
                        "./features/workspaces/settings/settingsRoutes"
                      ).then((m) => ({
                        Component: m.SettingsIndexRedirect,
                      })),
                  },
                  {
                    path: "general",
                    lazy: () =>
                      import(
                        "./features/workspaces/settings/settingsRoutes"
                      ).then((m) => ({
                        Component: m.GeneralSettingsRoute,
                      })),
                  },
                  {
                    path: "members",
                    lazy: () =>
                      import(
                        "./features/workspaces/settings/settingsRoutes"
                      ).then((m) => ({
                        Component: m.MembersSettingsRoute,
                      })),
                  },
                  {
                    path: "*",
                    lazy: () =>
                      import(
                        "./features/workspaces/settings/settingsRoutes"
                      ).then((m) => ({
                        Component: m.SettingsSectionNotFound,
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
  { path: "*", element: <WorkspaceNotFound /> },
];
