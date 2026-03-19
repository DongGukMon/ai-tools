package whip

import (
	"fmt"
	"strings"
	"unicode"
)

const (
	TaskTypeCoding     = "coding"
	TaskTypeDebugging  = "debugging"
	TaskTypeDesign     = "design"
	TaskTypeFrontend   = "frontend"
	TaskTypeDocs       = "docs"
	TaskTypeTesting    = "testing"
	TaskTypeDevOps     = "devops"
	TaskTypeRefactor   = "refactor"
	TaskTypeReview     = "review"
	TaskTypeSimulation = "simulation"
	TaskTypeGeneral    = "general"
)

type taskTypeKeyword struct {
	value  string
	prefix bool
}

type taskTypeRule struct {
	taskType string
	keywords []taskTypeKeyword
}

var orderedTaskTypeRules = []taskTypeRule{
	{
		taskType: TaskTypeDebugging,
		keywords: []taskTypeKeyword{
			{value: "debug"},
			{value: "fix"},
			{value: "bug"},
			{value: "error"},
			{value: "crash"},
			{value: "panic"},
		},
	},
	{
		taskType: TaskTypeRefactor,
		keywords: []taskTypeKeyword{
			{value: "refactor"},
			{value: "rename"},
			{value: "reorganize"},
			{value: "restructure"},
			{value: "cleanup"},
		},
	},
	{
		taskType: TaskTypeTesting,
		keywords: []taskTypeKeyword{
			{value: "test"},
			{value: "spec"},
			{value: "assert"},
			{value: "coverage"},
		},
	},
	{
		taskType: TaskTypeDocs,
		keywords: []taskTypeKeyword{
			{value: "doc"},
			{value: "docs"},
			{value: "readme"},
			{value: "comment"},
			{value: "changelog"},
		},
	},
	{
		taskType: TaskTypeDesign,
		keywords: []taskTypeKeyword{
			{value: "design"},
			{value: "architect"},
			{value: "rfc"},
			{value: "proposal"},
			{value: "plan"},
		},
	},
	{
		taskType: TaskTypeFrontend,
		keywords: []taskTypeKeyword{
			{value: "frontend"},
			{value: "ui"},
			{value: "component"},
			{value: "css"},
			{value: "tailwind"},
			{value: "react"},
			{value: "html"},
		},
	},
	{
		taskType: TaskTypeDevOps,
		keywords: []taskTypeKeyword{
			{value: "ci"},
			{value: "cd"},
			{value: "deploy"},
			{value: "docker"},
			{value: "workflow"},
			{value: "pipeline"},
			{value: "infra"},
		},
	},
	{
		taskType: TaskTypeReview,
		keywords: []taskTypeKeyword{
			{value: "review"},
			{value: "audit"},
			{value: "inspect"},
			{value: "lgtm"},
		},
	},
	{
		taskType: TaskTypeSimulation,
		keywords: []taskTypeKeyword{
			{value: "simulat", prefix: true},
			{value: "benchmark"},
			{value: "stress"},
			{value: "load test"},
		},
	},
	{
		taskType: TaskTypeCoding,
		keywords: []taskTypeKeyword{
			{value: "implement"},
			{value: "add"},
			{value: "create"},
			{value: "build"},
			{value: "feature"},
			{value: "endpoint"},
			{value: "api"},
			{value: "func"},
			{value: "module"},
			{value: "service"},
			{value: "handler"},
			{value: "middleware"},
			{value: "struct"},
			{value: "interface"},
			{value: "package"},
		},
	},
}

func AllTaskTypes() []string {
	return []string{
		TaskTypeCoding,
		TaskTypeDebugging,
		TaskTypeDesign,
		TaskTypeFrontend,
		TaskTypeDocs,
		TaskTypeTesting,
		TaskTypeDevOps,
		TaskTypeRefactor,
		TaskTypeReview,
		TaskTypeSimulation,
		TaskTypeGeneral,
	}
}

func InferTaskType(title, description string) string {
	if taskType := inferTaskTypeFromText(title); taskType != "" {
		return taskType
	}
	if taskType := inferTaskTypeFromText(description); taskType != "" {
		return taskType
	}
	return TaskTypeGeneral
}

func ValidateTaskType(t string) error {
	for _, valid := range AllTaskTypes() {
		if t == valid {
			return nil
		}
	}
	return fmt.Errorf("invalid task type %q: must be one of %s", t, strings.Join(AllTaskTypes(), ", "))
}

func inferTaskTypeFromText(text string) string {
	normalized := normalizeTaskTypeText(text)
	if normalized == "" {
		return ""
	}
	words := strings.Fields(normalized)
	for _, rule := range orderedTaskTypeRules {
		if matchesTaskTypeRule(normalized, words, rule) {
			return rule.taskType
		}
	}
	return ""
}

func normalizeTaskTypeText(text string) string {
	var builder strings.Builder
	builder.Grow(len(text))

	lastWasSpace := true
	for _, r := range strings.ToLower(text) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			builder.WriteRune(r)
			lastWasSpace = false
			continue
		}
		if lastWasSpace {
			continue
		}
		builder.WriteByte(' ')
		lastWasSpace = true
	}

	return strings.TrimSpace(builder.String())
}

func matchesTaskTypeRule(text string, words []string, rule taskTypeRule) bool {
	for _, keyword := range rule.keywords {
		if taskTypeKeywordMatch(text, words, keyword) {
			return true
		}
	}
	return false
}

func taskTypeKeywordMatch(text string, words []string, keyword taskTypeKeyword) bool {
	if strings.Contains(keyword.value, " ") {
		return strings.Contains(text, keyword.value)
	}
	for _, word := range words {
		if keyword.prefix {
			if strings.HasPrefix(word, keyword.value) {
				return true
			}
			continue
		}
		if word == keyword.value {
			return true
		}
	}
	return false
}
