import { useMatches } from "react-router";

export interface ProjectPageMeta {
  title: string;
}

export interface ProjectPageHandle {
  projectPage: ProjectPageMeta;
}

export function isProjectPageHandle(
  handle: unknown,
): handle is ProjectPageHandle {
  if (
    typeof handle !== "object" ||
    handle === null ||
    !("projectPage" in handle)
  ) {
    return false;
  }
  const page: unknown = (handle as { projectPage: unknown }).projectPage;
  return (
    typeof page === "object" &&
    page !== null &&
    "title" in page &&
    typeof (page as { title: unknown }).title === "string"
  );
}

/** Meta of the deepest matched route that declares `projectPage`. */
export function useProjectPageMeta(): ProjectPageMeta | null {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i -= 1) {
    const { handle } = matches[i];
    if (isProjectPageHandle(handle)) return handle.projectPage;
  }
  return null;
}
