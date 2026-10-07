import { Outlet } from "react-router";
import { AppHeader } from "./AppHeader";

/** Frame of every signed-in route: the head bar above the page. */
export function AppLayout() {
  return (
    <>
      <AppHeader />
      <Outlet />
    </>
  );
}
