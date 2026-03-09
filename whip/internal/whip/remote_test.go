package whip

import "testing"

func TestNormalizeRemoteAuthModeDefaultsToDevice(t *testing.T) {
	if got := NormalizeRemoteAuthMode(""); got != RemoteAuthModeDevice {
		t.Fatalf("NormalizeRemoteAuthMode(\"\") = %q, want %q", got, RemoteAuthModeDevice)
	}
}
