package tests

import (
	"testing"
	"engine"
)

func TestTheFacadeNamesEveryDomain ( t *testing.T ) {

	t.Parallel()

	if got := engine.NewHello().World(); got != greeting {

		t.Fatalf("NewHello().World() = %q, want %q", got, greeting)

	}

}
