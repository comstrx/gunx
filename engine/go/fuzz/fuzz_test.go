package fuzz

import (
	"testing"
	"engine/hello"
)

const greeting = "hello world"

func FuzzWorld ( f *testing.F ) {

	f.Add([]byte("hello"))
	f.Add([]byte{})

	f.Fuzz(func(t *testing.T, data []byte) {

		got := hello.New().World()

		if got != greeting {

			t.Fatalf("World() = %q for input of %d bytes, want %q", got, len(data), greeting)

		}

	})

}
