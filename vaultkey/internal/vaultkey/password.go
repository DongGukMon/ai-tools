package vaultkey

import (
	"fmt"
	"os"
	"strings"

	"golang.org/x/term"
)

func GetPassword(flagValue string) (string, error) {
	// 1. Environment variable
	if env := os.Getenv("VAULTKEY_PASSWORD"); env != "" {
		return env, nil
	}

	// 2. --password flag
	if flagValue != "" {
		return flagValue, nil
	}

	// 3. Interactive prompt
	return promptPassword("Password: ")
}

func GetPasswordWithConfirm(flagValue string) (string, error) {
	// 1. Environment variable
	if env := os.Getenv("VAULTKEY_PASSWORD"); env != "" {
		return env, nil
	}

	// 2. --password flag
	if flagValue != "" {
		return flagValue, nil
	}

	// 3. Interactive prompt with confirmation
	pw, err := promptPassword("New password: ")
	if err != nil {
		return "", err
	}

	confirm, err := promptPassword("Confirm password: ")
	if err != nil {
		return "", err
	}

	if pw != confirm {
		return "", fmt.Errorf("passwords do not match")
	}

	return pw, nil
}

func promptPassword(prompt string) (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return "", fmt.Errorf("no password provided (use VAULTKEY_PASSWORD env or --password flag)")
	}

	fmt.Fprint(os.Stderr, prompt)
	raw, err := term.ReadPassword(fd)
	fmt.Fprintln(os.Stderr)
	if err != nil {
		return "", fmt.Errorf("reading password: %w", err)
	}

	pw := strings.TrimSpace(string(raw))
	if pw == "" {
		return "", fmt.Errorf("password cannot be empty")
	}
	return pw, nil
}
