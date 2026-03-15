package irclib

import (
	"errors"
	"fmt"
)

const maxSafeIdentifierLength = 32

var ErrInvalidIdentifier = errors.New("invalid identifier")

// IsValidPeerName reports whether a peer name is safe to use in filesystem-backed paths.
func IsValidPeerName(name string) bool {
	return isValidSafeIdentifier(name)
}

func validatePeerName(name string) error {
	return validateSafeIdentifier("peer name", name)
}

func validateTaskID(id string) error {
	return validateSafeIdentifier("task id", id)
}

func validateSafeIdentifier(kind, value string) error {
	if !isValidSafeIdentifier(value) {
		return fmt.Errorf("%w: invalid %s", ErrInvalidIdentifier, kind)
	}
	return nil
}

func isValidSafeIdentifier(value string) bool {
	if value == "" || len(value) > maxSafeIdentifierLength {
		return false
	}
	for _, c := range value {
		if !((c >= 'a' && c <= 'z') ||
			(c >= 'A' && c <= 'Z') ||
			(c >= '0' && c <= '9') ||
			c == '-' ||
			c == '_') {
			return false
		}
	}
	return true
}
