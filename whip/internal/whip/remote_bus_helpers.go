package whip

import agentbus "github.com/bang9/ai-tools/shared/agentbus"

func NewStoreWithBaseDir(dir string) (*agentbus.Store, error) {
	return agentbus.NewStoreWithBaseDir(dir)
}
