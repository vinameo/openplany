import { useContext } from "react";
import {
  CurrentWorkspaceContext,
  type CurrentWorkspaceValue,
} from "./currentWorkspaceContext";

export function useCurrentWorkspace(): CurrentWorkspaceValue {
  const value = useContext(CurrentWorkspaceContext);
  if (!value) {
    throw new Error(
      "useCurrentWorkspace must be used within a WorkspaceLayout",
    );
  }
  return value;
}

