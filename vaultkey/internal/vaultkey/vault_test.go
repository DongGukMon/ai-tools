package vaultkey

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"golang.org/x/crypto/pbkdf2"
)

func tempRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	return dir
}

func TestCreateAndLoad(t *testing.T) {
	repo := tempRepo(t)
	pw := "test-password-123"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	if err := v.Set("app", "KEY", "secret-value"); err != nil {
		t.Fatalf("Set: %v", err)
	}

	// Reload from disk
	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault: %v", err)
	}

	got, err := v2.Get("app", "KEY")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}

	if got != "secret-value" {
		t.Errorf("got %q, want %q", got, "secret-value")
	}
}

func TestWrongPassword(t *testing.T) {
	repo := tempRepo(t)

	v, err := CreateVault(repo, "correct-password")
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	if err := v.Set("app", "KEY", "secret"); err != nil {
		t.Fatalf("Set: %v", err)
	}

	v2, err := LoadVault(repo, "wrong-password")
	if err != nil {
		t.Fatalf("LoadVault: %v", err)
	}

	_, err = v2.Get("app", "KEY")
	if err == nil {
		t.Fatal("expected decryption error with wrong password")
	}
}

func TestScopeIsolation(t *testing.T) {
	repo := tempRepo(t)
	pw := "password"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	if err := v.Set("app/dev", "KEY", "dev-value"); err != nil {
		t.Fatalf("Set dev: %v", err)
	}
	if err := v.Set("app/prod", "KEY", "prod-value"); err != nil {
		t.Fatalf("Set prod: %v", err)
	}

	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault: %v", err)
	}

	dev, err := v2.Get("app/dev", "KEY")
	if err != nil {
		t.Fatalf("Get dev: %v", err)
	}
	prod, err := v2.Get("app/prod", "KEY")
	if err != nil {
		t.Fatalf("Get prod: %v", err)
	}

	if dev != "dev-value" {
		t.Errorf("dev: got %q, want %q", dev, "dev-value")
	}
	if prod != "prod-value" {
		t.Errorf("prod: got %q, want %q", prod, "prod-value")
	}
}

func TestListPrefixMatching(t *testing.T) {
	repo := tempRepo(t)
	pw := "password"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	v.Set("menulens/dev", "JWT", "a")
	v.Set("menulens/prod", "JWT", "b")
	v.Set("ponte", "API_KEY", "c")

	all := v.List("")
	if len(all) != 3 {
		t.Errorf("list all: got %d entries, want 3", len(all))
	}

	ml := v.List("menulens")
	if len(ml) != 2 {
		t.Errorf("list menulens: got %d entries, want 2", len(ml))
	}

	ponte := v.List("ponte")
	if len(ponte) != 1 {
		t.Errorf("list ponte: got %d entries, want 1", len(ponte))
	}
}

func TestDelete(t *testing.T) {
	repo := tempRepo(t)
	pw := "password"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	v.Set("app", "A", "1")
	v.Set("app", "B", "2")

	if err := v.Delete("app", "A"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	if _, err := v.Get("app", "A"); err == nil {
		t.Error("expected error after delete")
	}

	got, err := v.Get("app", "B")
	if err != nil {
		t.Fatalf("Get B: %v", err)
	}
	if got != "2" {
		t.Errorf("B: got %q, want %q", got, "2")
	}
}

func TestDeleteRemovesEmptyScope(t *testing.T) {
	repo := tempRepo(t)
	pw := "password"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	v.Set("temp", "ONLY", "value")

	if err := v.Delete("temp", "ONLY"); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	entries := v.List("temp")
	if len(entries) != 0 {
		t.Errorf("expected empty scope to be removed, got %v", entries)
	}
}

func TestCreateVaultAlreadyExists(t *testing.T) {
	repo := tempRepo(t)

	if _, err := CreateVault(repo, "pw"); err != nil {
		t.Fatalf("first create: %v", err)
	}

	_, err := CreateVault(repo, "pw")
	if err == nil {
		t.Fatal("expected error on duplicate create")
	}
}

func TestLoadVaultNotFound(t *testing.T) {
	_, err := LoadVault(t.TempDir(), "pw")
	if err == nil {
		t.Fatal("expected error when vault doesn't exist")
	}
}

func TestVaultFilePermissions(t *testing.T) {
	repo := tempRepo(t)

	if _, err := CreateVault(repo, "pw"); err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	info, err := os.Stat(filepath.Join(repo, vaultFileName))
	if err != nil {
		t.Fatalf("stat: %v", err)
	}

	perm := info.Mode().Perm()
	if perm != 0600 {
		t.Errorf("vault file permissions: got %o, want 0600", perm)
	}
}

func TestLoadVaultRejectsSymlink(t *testing.T) {
	repo := tempRepo(t)

	salt := make([]byte, saltSize)
	payload, err := json.Marshal(VaultFile{
		Version: currentVaultVersion,
		Salt:    base64.StdEncoding.EncodeToString(salt),
		Scopes:  map[string]map[string]EncryptedValue{},
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}

	target := filepath.Join(repo, "actual-vault.json")
	if err := os.WriteFile(target, payload, 0600); err != nil {
		t.Fatalf("write target: %v", err)
	}

	link := filepath.Join(repo, vaultFileName)
	if err := os.Symlink(target, link); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	_, err = LoadVault(repo, "pw")
	if err == nil {
		t.Fatal("expected symlinked vault path to be rejected")
	}
	if !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected symlink error, got %v", err)
	}
}

func TestCreateVaultRejectsBrokenSymlink(t *testing.T) {
	repo := tempRepo(t)

	link := filepath.Join(repo, vaultFileName)
	if err := os.Symlink(filepath.Join(repo, "missing-vault.json"), link); err != nil {
		t.Fatalf("symlink: %v", err)
	}

	_, err := CreateVault(repo, "pw")
	if err == nil {
		t.Fatal("expected create to fail when vault path is a symlink")
	}
	if !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("expected symlink error, got %v", err)
	}
}

// --- v2 crypto upgrade tests ---

func TestV2CreateAndLoad(t *testing.T) {
	repo := tempRepo(t)
	pw := "test-password-v2"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	if v.Version() != 2 {
		t.Fatalf("expected version 2, got %d", v.Version())
	}
	if v.IsLegacy() {
		t.Fatal("new vault should not be legacy")
	}

	if err := v.Set("app", "SECRET", "v2-secret"); err != nil {
		t.Fatalf("Set: %v", err)
	}

	// Reload from disk
	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault: %v", err)
	}

	if v2.Version() != 2 {
		t.Fatalf("reloaded version: got %d, want 2", v2.Version())
	}

	got, err := v2.Get("app", "SECRET")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got != "v2-secret" {
		t.Errorf("got %q, want %q", got, "v2-secret")
	}

	// Verify vault file has KDF fields
	raw, _ := os.ReadFile(filepath.Join(repo, vaultFileName))
	var vf VaultFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("unmarshal vault file: %v", err)
	}
	if vf.KDF != kdfArgon2id {
		t.Errorf("KDF: got %q, want %q", vf.KDF, kdfArgon2id)
	}
	if vf.KDFParams == nil {
		t.Fatal("KDFParams should not be nil")
	}
}

func TestV2AADPreventsSwap(t *testing.T) {
	repo := tempRepo(t)
	pw := "test-password-aad"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	if err := v.Set("app", "KEY_A", "value-a"); err != nil {
		t.Fatalf("Set KEY_A: %v", err)
	}
	if err := v.Set("app", "KEY_B", "value-b"); err != nil {
		t.Fatalf("Set KEY_B: %v", err)
	}

	// Read the vault file, swap the ciphertexts, write back
	raw, err := os.ReadFile(filepath.Join(repo, vaultFileName))
	if err != nil {
		t.Fatalf("read vault: %v", err)
	}

	var vf VaultFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Swap KEY_A and KEY_B ciphertexts
	a := vf.Scopes["app"]["KEY_A"]
	b := vf.Scopes["app"]["KEY_B"]
	vf.Scopes["app"]["KEY_A"] = b
	vf.Scopes["app"]["KEY_B"] = a

	swapped, err := json.MarshalIndent(vf, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := os.WriteFile(filepath.Join(repo, vaultFileName), swapped, 0600); err != nil {
		t.Fatalf("write: %v", err)
	}

	// Reload and try to decrypt — should fail due to AAD mismatch
	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault after swap: %v", err)
	}

	_, err = v2.Get("app", "KEY_A")
	if err == nil {
		t.Error("expected decryption failure for KEY_A after swap")
	}

	_, err = v2.Get("app", "KEY_B")
	if err == nil {
		t.Error("expected decryption failure for KEY_B after swap")
	}
}

// createV1Vault manually creates a v1-format vault file for backward compat testing.
func createV1Vault(t *testing.T, repo, pw string, secrets map[string]map[string]string) {
	t.Helper()

	salt := make([]byte, saltSize)
	if _, err := rand.Read(salt); err != nil {
		t.Fatalf("generate salt: %v", err)
	}

	key := pbkdf2.Key([]byte(pw), salt, pbkdf2Iterations, keySize, sha256.New)

	scopes := make(map[string]map[string]EncryptedValue)
	for scope, keys := range secrets {
		scopes[scope] = make(map[string]EncryptedValue)
		for k, val := range keys {
			nonce := make([]byte, nonceSize)
			if _, err := rand.Read(nonce); err != nil {
				t.Fatalf("generate nonce: %v", err)
			}

			block, err := aes.NewCipher(key)
			if err != nil {
				t.Fatalf("create cipher: %v", err)
			}
			gcm, err := cipher.NewGCM(block)
			if err != nil {
				t.Fatalf("create GCM: %v", err)
			}

			ct := gcm.Seal(nil, nonce, []byte(val), nil) // v1: no AAD
			scopes[scope][k] = EncryptedValue{
				Nonce:      base64.StdEncoding.EncodeToString(nonce),
				Ciphertext: base64.StdEncoding.EncodeToString(ct),
			}
		}
	}

	vf := VaultFile{
		Version: 1,
		Salt:    base64.StdEncoding.EncodeToString(salt),
		Scopes:  scopes,
	}

	raw, err := json.MarshalIndent(vf, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	raw = append(raw, '\n')

	if err := os.WriteFile(filepath.Join(repo, vaultFileName), raw, 0600); err != nil {
		t.Fatalf("write vault: %v", err)
	}
}

func TestV1BackwardCompatibility(t *testing.T) {
	repo := tempRepo(t)
	pw := "v1-password"

	createV1Vault(t, repo, pw, map[string]map[string]string{
		"app/prod": {"DB_PASS": "s3cret", "API_KEY": "key123"},
	})

	v, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault v1: %v", err)
	}

	if v.Version() != 1 {
		t.Fatalf("expected version 1, got %d", v.Version())
	}
	if !v.IsLegacy() {
		t.Fatal("v1 vault should be legacy")
	}

	got, err := v.Get("app/prod", "DB_PASS")
	if err != nil {
		t.Fatalf("Get DB_PASS: %v", err)
	}
	if got != "s3cret" {
		t.Errorf("DB_PASS: got %q, want %q", got, "s3cret")
	}

	got2, err := v.Get("app/prod", "API_KEY")
	if err != nil {
		t.Fatalf("Get API_KEY: %v", err)
	}
	if got2 != "key123" {
		t.Errorf("API_KEY: got %q, want %q", got2, "key123")
	}

	// Verify Set still works on v1 vault (stays v1)
	if err := v.Set("app/prod", "NEW_KEY", "new-val"); err != nil {
		t.Fatalf("Set on v1: %v", err)
	}

	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("reload after set: %v", err)
	}
	if v2.Version() != 1 {
		t.Fatalf("version should still be 1 after Set, got %d", v2.Version())
	}
	gotNew, err := v2.Get("app/prod", "NEW_KEY")
	if err != nil {
		t.Fatalf("Get NEW_KEY: %v", err)
	}
	if gotNew != "new-val" {
		t.Errorf("NEW_KEY: got %q, want %q", gotNew, "new-val")
	}
}

func TestMigrateV1ToV2(t *testing.T) {
	repo := tempRepo(t)
	pw := "migrate-password"

	createV1Vault(t, repo, pw, map[string]map[string]string{
		"app/prod": {"DB_PASS": "s3cret", "API_KEY": "key123"},
		"app/dev":  {"DB_PASS": "dev-pass"},
	})

	v, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault v1: %v", err)
	}

	if v.Version() != 1 {
		t.Fatalf("pre-migrate version: got %d, want 1", v.Version())
	}

	count, err := v.Migrate(pw)
	if err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	if count != 3 {
		t.Errorf("migrated count: got %d, want 3", count)
	}

	// Reload from disk and verify
	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault after migrate: %v", err)
	}

	if v2.Version() != 2 {
		t.Fatalf("post-migrate version: got %d, want 2", v2.Version())
	}
	if v2.IsLegacy() {
		t.Fatal("migrated vault should not be legacy")
	}

	// Verify all secrets survived migration
	tests := []struct {
		scope, key, want string
	}{
		{"app/prod", "DB_PASS", "s3cret"},
		{"app/prod", "API_KEY", "key123"},
		{"app/dev", "DB_PASS", "dev-pass"},
	}
	for _, tc := range tests {
		got, err := v2.Get(tc.scope, tc.key)
		if err != nil {
			t.Fatalf("Get %s/%s after migrate: %v", tc.scope, tc.key, err)
		}
		if got != tc.want {
			t.Errorf("%s/%s: got %q, want %q", tc.scope, tc.key, got, tc.want)
		}
	}

	// Verify vault file metadata
	raw, _ := os.ReadFile(filepath.Join(repo, vaultFileName))
	var vf VaultFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if vf.KDF != kdfArgon2id {
		t.Errorf("KDF after migrate: got %q, want %q", vf.KDF, kdfArgon2id)
	}
	if vf.KDFParams == nil {
		t.Fatal("KDFParams should not be nil after migrate")
	}
}

func TestMigrateV2Noop(t *testing.T) {
	repo := tempRepo(t)
	pw := "already-v2"

	v, err := CreateVault(repo, pw)
	if err != nil {
		t.Fatalf("CreateVault: %v", err)
	}

	if err := v.Set("app", "KEY", "value"); err != nil {
		t.Fatalf("Set: %v", err)
	}

	count, err := v.Migrate(pw)
	if err != nil {
		t.Fatalf("Migrate on v2: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 migrated for v2, got %d", count)
	}

	// Verify secrets still work
	v2, err := LoadVault(repo, pw)
	if err != nil {
		t.Fatalf("LoadVault after noop migrate: %v", err)
	}
	got, err := v2.Get("app", "KEY")
	if err != nil {
		t.Fatalf("Get after noop migrate: %v", err)
	}
	if got != "value" {
		t.Errorf("got %q, want %q", got, "value")
	}
}
