package whip

import agentirc "github.com/bang9/ai-tools/shared/agentirc"

func NewStoreWithBaseDir(dir string) (*agentirc.Store, error) {
	return agentirc.NewStoreWithBaseDir(dir)
}
