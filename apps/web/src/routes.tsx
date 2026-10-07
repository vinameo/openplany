import { Navigate, type RouteObject } from "react-router";
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

export const appRoutes: RouteObject[] = [
  { path: SIGN_IN_PATH, element: <SignInRoute /> },
  { path: SET_PASSWORD_PATH, element: <SetPasswordRoute /> },
  { path: FORGOT_PASSWORD_PATH, element: <ForgotPasswordRoute /> },
  {
    element: <RequireAuth />,
    children: [{ path: HOME_PATH, element: <HomePage /> }],
  },
  { path: "*", element: <Navigate to={HOME_PATH} replace /> },
];
