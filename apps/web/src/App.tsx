import { useState } from "react";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AuthProvider } from "./features/auth/AuthProvider";
import { appRoutes } from "./routes";

export function App() {
  const [router] = useState(() => createBrowserRouter(appRoutes));

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
