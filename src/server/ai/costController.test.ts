import { describe, expect, it } from "vitest";
import { AgentType, ModelTier, TaskType } from "@prisma/client";
import { BudgetExceededError, CostController, evaluateBudget } from "@/server/ai/costController";
import { AiCallRecord, CostStore, ModelCallInput, ModelCallOutput, ModelProvider } from "@/server/ai/types";

class FakeCostStore implements CostStore {
  calls: AiCallRecord[] = [];
  constructor(private spentTodayEur: number) {}
  async getSpentTodayEur() {
    return this.spentTodayEur;
  }
  async recordCall(entry: AiCallRecord) {
    this.calls.push(entry);
    this.spentTodayEur += entry.estimatedCostEur;
  }
}

class FakeModelProvider implements ModelProvider {
  id = "fake";
  calls: ModelCallInput[] = [];
  async run(input: ModelCallInput): Promise<ModelCallOutput> {
    this.calls.push(input);
    return { content: "{}", inputTokens: 100, outputTokens: 100, model: "fake-model" };
  }
}

describe("evaluateBudget (pure)", () => {
  it("allows a call that stays within the hard limit", () => {
    const result = evaluateBudget({ spentTodayEur: 2.5, estimatedCostEur: 0.4, hardLimitEur: 3.0 });
    expect(result.allowed).toBe(true);
    expect(result.wouldTotalEur).toBeCloseTo(2.9, 6);
  });

  it("blocks a call that would push total spend past the hard limit", () => {
    const result = evaluateBudget({ spentTodayEur: 2.9, estimatedCostEur: 0.2, hardLimitEur: 3.0 });
    expect(result.allowed).toBe(false);
    expect(result.wouldTotalEur).toBeCloseTo(3.1, 6);
  });

  it("allows a call that lands exactly on the hard limit", () => {
    const result = evaluateBudget({ spentTodayEur: 2.0, estimatedCostEur: 1.0, hardLimitEur: 3.0 });
    expect(result.allowed).toBe(true);
  });
});

describe("CostController.spend — hard daily budget enforcement", () => {
  // This is the explicit proof required by the spec: daily budget = €3.00,
  // and a call that would push total spend above €3.00 is blocked *before*
  // the model provider ever runs and *before* anything is billed.
  it("blocks the call when today's spend is already at the €3.00 hard limit", async () => {
    const store = new FakeCostStore(3.0);
    const provider = new FakeModelProvider();
    const controller = new CostController(store, provider, { hardLimitEur: 3.0 });

    await expect(
      controller.spend({
        taskType: TaskType.REASONING,
        systemPrompt: "system",
        userPrompt: "user",
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(provider.calls).toHaveLength(0);
    expect(store.calls).toHaveLength(0);
  });

  it("blocks the call when spend is just under €3.00 but the estimate would tip it over", async () => {
    const store = new FakeCostStore(2.999);
    const provider = new FakeModelProvider();
    const controller = new CostController(store, provider, { hardLimitEur: 3.0 });

    // JUDGE tasks route to STRONG tier, the most expensive — guarantees the
    // estimate is non-trivial relative to the remaining €0.001 headroom.
    await expect(
      controller.spend({
        taskType: TaskType.JUDGE,
        systemPrompt: "x".repeat(2000),
        userPrompt: "y".repeat(2000),
      }),
    ).rejects.toBeInstanceOf(BudgetExceededError);

    expect(provider.calls).toHaveLength(0);
  });

  it("allows and records a call comfortably within budget", async () => {
    const store = new FakeCostStore(0);
    const provider = new FakeModelProvider();
    const controller = new CostController(store, provider, { hardLimitEur: 3.0 });

    const result = await controller.spend({
      taskType: TaskType.CLASSIFICATION,
      systemPrompt: "system",
      userPrompt: "user",
      researchRunId: "run_1",
      productId: "prod_1",
      agentType: AgentType.MARKET,
    });

    expect(provider.calls).toHaveLength(1);
    expect(store.calls).toHaveLength(1);
    expect(store.calls[0].tier).toBe(ModelTier.CHEAP);
    expect(result.costEur).toBeGreaterThan(0);
  });

  it("never lets cumulative recorded spend exceed the hard limit across many calls", async () => {
    const store = new FakeCostStore(0);
    const provider = new FakeModelProvider();
    const controller = new CostController(store, provider, { hardLimitEur: 3.0 });

    let blocked = 0;
    for (let i = 0; i < 2000; i++) {
      try {
        await controller.spend({
          taskType: TaskType.JUDGE, // strong tier, biggest per-call cost
          systemPrompt: "x".repeat(3000),
          userPrompt: "y".repeat(3000),
        });
      } catch (err) {
        expect(err).toBeInstanceOf(BudgetExceededError);
        blocked++;
      }
    }

    const totalSpent = store.calls.reduce((sum, c) => sum + c.estimatedCostEur, 0);
    expect(totalSpent).toBeLessThanOrEqual(3.0 + 1e-9);
    expect(blocked).toBeGreaterThan(0);
  });
});

describe("CostController.estimate", () => {
  it("routes JUDGE task type to the STRONG tier", async () => {
    const controller = new CostController(new FakeCostStore(0), new FakeModelProvider(), {
      hardLimitEur: 3,
    });
    const est = controller.estimate({ taskType: TaskType.JUDGE, systemPrompt: "a", userPrompt: "b" });
    expect(est.tier).toBe(ModelTier.STRONG);
  });

  it("routes CLASSIFICATION task type to the CHEAP tier", async () => {
    const controller = new CostController(new FakeCostStore(0), new FakeModelProvider(), {
      hardLimitEur: 3,
    });
    const est = controller.estimate({ taskType: TaskType.CLASSIFICATION, systemPrompt: "a", userPrompt: "b" });
    expect(est.tier).toBe(ModelTier.CHEAP);
  });
});
