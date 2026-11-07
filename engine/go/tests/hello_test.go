package tests

import (
	"testing"
	"engine/hello"
)

const greeting = "hello world"

func TestWorldIsExactlyTheGreeting ( t *testing.T ) {

	t.Parallel()

	got := hello.New().World()

	if got != greeting { t.Fatalf("World() = %q, want %q", got, greeting) }

	if len(got) != 11 { t.Fatalf("len(World()) = %d, want 11", len(got)) }

}

func TestWorldIsTheSameOnEveryCall ( t *testing.T ) {

	t.Parallel()

	first, second := hello.New().World(), hello.New().World()

	if first != second {

		t.Fatalf("World() differs between calls: %q and %q", first, second)

	}

}
