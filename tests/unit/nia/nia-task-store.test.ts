import { afterEach, describe, expect, it } from "vitest";
import { __resetNiaTaskStoreForTests, useNiaTaskStore } from "@/features/nia/nia-task-store";
afterEach(() => __resetNiaTaskStoreForTests());
describe("Nia task store", () => {
  it("creates an inspectable planned task and allows controlled lifecycle changes", () => { const store = useNiaTaskStore.getState(); const task = store.createTask("Review chapter 3"); expect(task).not.toBeNull(); expect(useNiaTaskStore.getState().tasks[0]).toMatchObject({ objective: "Review chapter 3", status: "planned" }); useNiaTaskStore.getState().setStatus(task!.id, "running"); expect(useNiaTaskStore.getState().tasks[0].status).toBe("running"); useNiaTaskStore.getState().addEvidence(task!.id, { source: "user", summary: "Read section 3.1" }); expect(useNiaTaskStore.getState().tasks[0].evidence[0].summary).toBe("Read section 3.1"); });
  it("rejects empty task objectives", () => { expect(useNiaTaskStore.getState().createTask(" ")).toBeNull(); });
});
