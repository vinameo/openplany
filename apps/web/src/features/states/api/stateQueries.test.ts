import { QueryClient } from "@tanstack/react-query";
import type { StateListResponse } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { addWorkItemToStateCounts, stateKeys } from "./stateQueries";

function list(workItemCount?: number): StateListResponse {
  return {
    states: [
      {
        id: "s-1",
        name: "Todo",
        group: "planned",
        color: "#5B6B82",
        level: "default",
        ...(workItemCount !== undefined && { workItemCount }),
      },
      {
        id: "s-2",
        name: "Done",
        group: "finished",
        color: "#2F9E6E",
        level: "default",
        ...(workItemCount !== undefined && { workItemCount }),
      },
    ],
    ownCount: 0,
    ownMax: 50,
    initialStateId: "s-1",
  };
}

describe("addWorkItemToStateCounts", () => {
  it("adds one to the state's count on the project and workspace lists", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(stateKeys.project("acme", "OPS"), list(2));
    queryClient.setQueryData(stateKeys.workspace("acme"), list(5));

    addWorkItemToStateCounts(queryClient, "acme", "OPS", "s-1");

    const project = queryClient.getQueryData<StateListResponse>(
      stateKeys.project("acme", "OPS"),
    );
    const workspace = queryClient.getQueryData<StateListResponse>(
      stateKeys.workspace("acme"),
    );
    expect(project?.states.map((s) => s.workItemCount)).toEqual([3, 2]);
    expect(workspace?.states.map((s) => s.workItemCount)).toEqual([6, 5]);
  });

  it("leaves lists loaded without counts and absent lists alone", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(stateKeys.project("acme", "OPS"), list());

    addWorkItemToStateCounts(queryClient, "acme", "OPS", "s-1");

    expect(
      queryClient
        .getQueryData<StateListResponse>(stateKeys.project("acme", "OPS"))
        ?.states.every((s) => s.workItemCount === undefined),
    ).toBe(true);
    expect(
      queryClient.getQueryData(stateKeys.workspace("acme")),
    ).toBeUndefined();
  });
});
