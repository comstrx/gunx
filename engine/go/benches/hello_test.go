package benches

import (
	"testing"
	"engine/hello"
)

func BenchmarkWorld ( b *testing.B ) {

	b.ReportAllocs()

	greeter := hello.New()

	for b.Loop() {

		_ = greeter.World()

	}

}
