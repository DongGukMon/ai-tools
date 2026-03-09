package whip

const MasterSessionName = "whip-master"

var spawnMasterTmuxSession = SpawnTmuxSession

// RemoteConfig holds settings for the whip remote command.
type RemoteConfig struct {
	Backend    string
	Difficulty string
	Tunnel     string
	Port       int
	CWD        string
}

// ServeResult holds the parsed output from claude-irc serve.
type ServeResult struct {
	ConnectURL string
	ShortURL   string
}
