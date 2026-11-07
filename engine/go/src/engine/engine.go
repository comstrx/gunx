package engine

import "engine/hello"

// Hello is the hello domain's namespace.
type Hello = hello.Hello

// NewHello returns a Hello.
func NewHello () Hello {

	return hello.New()

}
