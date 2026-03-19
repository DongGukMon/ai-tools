package whip

import "testing"

func TestInferTaskType(t *testing.T) {
	tests := []struct {
		name        string
		title       string
		description string
		want        string
	}{
		{name: "debugging", title: "Fix panic in worker", want: TaskTypeDebugging},
		{name: "refactor", title: "Rename handler package", want: TaskTypeRefactor},
		{name: "testing", title: "Add coverage for task store", want: TaskTypeTesting},
		{name: "docs", title: "Update README", want: TaskTypeDocs},
		{name: "design", title: "Draft RFC for workspace archiving", want: TaskTypeDesign},
		{name: "frontend", title: "Polish React component CSS", want: TaskTypeFrontend},
		{name: "devops", title: "CI workflow pipeline", want: TaskTypeDevOps},
		{name: "review", title: "Security audit of remote auth", want: TaskTypeReview},
		{name: "simulation", title: "Benchmark stress harness", want: TaskTypeSimulation},
		{name: "coding", title: "Implement task service interface", want: TaskTypeCoding},
		{name: "general fallback", title: "Weekly sync", description: "Discuss next steps", want: TaskTypeGeneral},
		{name: "description fallback", title: "Weekly sync", description: "Need to debug flaky worker", want: TaskTypeDebugging},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := InferTaskType(tc.title, tc.description); got != tc.want {
				t.Fatalf("InferTaskType(%q, %q) = %q, want %q", tc.title, tc.description, got, tc.want)
			}
		})
	}
}

func TestInferTaskType_TitleWinsOverDescription(t *testing.T) {
	got := InferTaskType("Refactor worker routing", "debug panic in production")
	if got != TaskTypeRefactor {
		t.Fatalf("InferTaskType title priority = %q, want %q", got, TaskTypeRefactor)
	}
}

func TestInferTaskType_PriorityWinsWithinTitle(t *testing.T) {
	got := InferTaskType("Fix API handler", "")
	if got != TaskTypeDebugging {
		t.Fatalf("InferTaskType priority = %q, want %q", got, TaskTypeDebugging)
	}
}

func TestNewTask_InferType(t *testing.T) {
	task := NewTask("Review middleware audit", "", "/tmp")
	if task.Type != TaskTypeReview {
		t.Fatalf("NewTask Type = %q, want %q", task.Type, TaskTypeReview)
	}
}

func TestValidateTaskType(t *testing.T) {
	for _, taskType := range AllTaskTypes() {
		if err := ValidateTaskType(taskType); err != nil {
			t.Fatalf("ValidateTaskType(%q): %v", taskType, err)
		}
	}

	if err := ValidateTaskType("invalid"); err == nil {
		t.Fatal("ValidateTaskType should reject invalid values")
	}
}
