import { describe, expect, it } from "vitest";
import { createPatrolGame } from "../../../public/examples/patrol-game.mjs";
describe("offline patrol game mechanics", () => {
  it("moves with bounded keyboard/touch input", () => {
    const game = createPatrolGame(); game.start();
    game.step(1, { left: true }); expect(game.state.player.x).toBeGreaterThanOrEqual(12);
    const x = game.state.player.x; game.step(.1, { right: true }); expect(game.state.player.x).toBeGreaterThan(x);
  });
  it("fires, collides and scores without fabricated HUD data", () => {
    const game = createPatrolGame(); game.start();
    game.step(.05, { fire: true }); expect(game.state.bullets.length).toBe(1);
    for (let i = 0; i < 30; i++) game.step(.05, {});
    expect(game.state.score).toBeGreaterThan(0);
  });
  it("ends after lost lives and resets on restart", () => {
    const game = createPatrolGame(); game.start();
    for (let i = 0; i < 900; i++) game.step(.05, {});
    expect(game.state.phase).toBe("over"); expect(game.state.lives).toBe(0);
    game.start(); expect(game.state.phase).toBe("running"); expect(game.state.lives).toBe(3); expect(game.state.score).toBe(0);
  });
});
