package whip

import irclib "github.com/bang9/ai-tools/shared/irclib"

func NewStoreWithBaseDir(dir string) (*irclib.Store, error) {
	return irclib.NewStoreWithBaseDir(dir)
}
