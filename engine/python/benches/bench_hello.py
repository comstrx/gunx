from engine.hello import hello
import time

ROUNDS  = 10_000
SAMPLES = 200

def sample () -> float:

    started = time.perf_counter_ns()

    for _ in range(ROUNDS): hello.world()

    return (time.perf_counter_ns() - started) / ROUNDS

def quantile ( timings: list[float], share: float ) -> float:

    index = min(len(timings) - 1, int(share * len(timings)))

    return timings[index]

def main () -> None:

    hello.world()

    timings = sorted(sample() for _ in range(SAMPLES))
    p50, p95, p99 = (quantile(timings, share) for share in (0.50, 0.95, 0.99))

    print(f"hello.world  p50={p50:.1f}ns  p95={p95:.1f}ns  p99={p99:.1f}ns  ({ROUNDS} calls x {SAMPLES} samples)")

if __name__ == "__main__": main()
