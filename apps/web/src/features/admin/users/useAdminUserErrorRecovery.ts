import { useCallback, useEffect, useRef } from "react";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "../../auth/api/authApi";
import { useAuth } from "../../auth/useAuth";
import {
  adminUserKeys,
  invalidateAdminUserLists,
} from "./api/adminUserQueries";

export interface AdminUserErrorRecovery {
  /** 401, or 403 PASSWORD_RESET_REQUIRED: back to sign-in. */
  expireSession: () => void;
  /**
   * 403 FORBIDDEN while on the page (WEB B2.1): re-read the session so a
   * user who lost instance admin is sent away by the route. Never rejects.
   */
  refreshSessionAfterForbidden: () => Promise<void>;
  /** 404 USER_NOT_FOUND (WEB B2.3, B2.7): red toast, drop the detail, reload lists. */
  forgetMissingUser: (userId: string, message: string) => void;
}

/** What every admin-user screen does with the errors of WEB B2.7 it shares. */
export function useAdminUserErrorRecovery(): AdminUserErrorRecovery {
  const queryClient = useQueryClient();
  // useAuth() rebuilds its functions on every session change. Callers run
  // these from effects keyed on the error, so they must stay stable: a
  // refresh that updates the session must not re-trigger the effect.
  const auth = useAuth();
  const authRef = useRef(auth);
  useEffect(() => {
    authRef.current = auth;
  });

  const expireSession = useCallback(() => {
    authRef.current.expireSession();
  }, []);

  const refreshSessionAfterForbidden = useCallback(async () => {
    try {
      const session = await authApi.getSession();
      if (session !== null) {
        authRef.current.updateUser(session.user);
      } else {
        authRef.current.expireSession();
      }
    } catch (error) {
      console.error("Session refresh after 403 failed", error);
    }
  }, []);

  const forgetMissingUser = useCallback(
    (userId: string, message: string) => {
      notifications.show({ color: "red", message });
      queryClient.removeQueries({ queryKey: adminUserKeys.detail(userId) });
      void invalidateAdminUserLists(queryClient);
    },
    [queryClient],
  );

  return { expireSession, refreshSessionAfterForbidden, forgetMissingUser };
}
