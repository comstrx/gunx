package tests

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func recorded () map[string][]string {

	return map[string][]string{
		"engine": {"Hello", "NewHello"},
		"hello":  {"Hello", "New", "World"},
	}

}

func TestEveryPackageExportsExactlyItsRecordedSurface ( t *testing.T ) {

	t.Parallel()

	for name, surface := range recorded() {

		exported := exportedNames(t, filepath.Join("..", "src", name))

		if !slices.Equal(exported, surface) { t.Fatalf("%s exports %v, recorded %v", name, exported, surface) }

	}

}

func exportedNames ( t *testing.T, directory string ) []string {

	t.Helper()

	entries, err := os.ReadDir(directory)
	if err != nil { t.Fatal(err) }

	var names []string

	for _, entry := range entries {

		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".go") { continue }

		path := filepath.Join(directory, entry.Name())

		file, err := parser.ParseFile(token.NewFileSet(), path, nil, parser.SkipObjectResolution)
		if err != nil { t.Fatal(err) }

		for _, declaration := range file.Decls { names = append(names, exportedOf(declaration)...) }

	}

	slices.Sort(names)

	return names

}

func exportedOf ( declaration ast.Decl ) []string {

	var names []string

	switch typed := declaration.(type) {

	case *ast.FuncDecl:

		if typed.Name.IsExported() { names = append(names, typed.Name.Name) }

	case *ast.GenDecl:

		for _, spec := range typed.Specs {

			typeSpec, ok := spec.(*ast.TypeSpec)

			if ok && typeSpec.Name.IsExported() { names = append(names, typeSpec.Name.Name) }

		}

	}

	return names

}
