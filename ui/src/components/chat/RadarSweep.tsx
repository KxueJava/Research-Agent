import { cn } from "@/lib/utils";

type RadarSweepProps = {
  className?: string;
  size?: number;
};

/**
 * 雷达扫描主视觉：同心圆 + 一道持续扫掠的光束 + 被扫到的信号点。
 *
 * <p>用于欢迎页，替原来的彩虹极光球。选它是因为它直接对应产品的核心动作——
 * 扫描 Reddit、X、Hacker News、YouTube、小红书等公开来源，而不是一个没有语义的装饰圆。</p>
 *
 * <p>纯 CSS 绘制，无 canvas / 无第三方依赖；动效统一在 chat-shell.css 里声明，
 * 并在 {@code prefers-reduced-motion} 下关闭（光束停在固定角度）。</p>
 */
export function RadarSweep({ className, size = 88 }: RadarSweepProps) {
  return (
    <div
      className={cn(
        "radar-sweep relative overflow-hidden rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size
      }}
      aria-hidden="true"
    >
      {/* 同心圆刻度 */}
      <span className="radar-ring" style={{ inset: "8%" }} />
      <span className="radar-ring" style={{ inset: "24%" }} />
      <span className="radar-ring" style={{ inset: "40%" }} />

      {/* 十字准线 */}
      <span className="radar-axis radar-axis-h" />
      <span className="radar-axis radar-axis-v" />

      {/* 扫描光束 */}
      <span className="radar-beam" />

      {/* 被扫到的信号点；延迟与光束同周期错开，读起来像依次命中 */}
      <span
        className="radar-blip"
        style={{
          left: "68%",
          top: "34%",
          animationDelay: "0s"
        }}
      />
      <span
        className="radar-blip"
        style={{
          left: "32%",
          top: "44%",
          animationDelay: "-0.9s"
        }}
      />
      <span
        className="radar-blip"
        style={{
          left: "56%",
          top: "72%",
          animationDelay: "-1.8s"
        }}
      />
      <span
        className="radar-blip"
        style={{
          left: "40%",
          top: "24%",
          animationDelay: "-2.7s"
        }}
      />

      {/* 中心发射点 */}
      <span className="radar-core" />
    </div>
  );
}
