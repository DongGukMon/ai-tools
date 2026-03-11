package main

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/bang9/ai-tools/whip/internal/whip"
	"github.com/spf13/cobra"
)

func graphCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:     "graph",
		Short:   "Render task dependency graph as ASCII box diagram",
		GroupID: "operations",
		Long: `Read task graph data from stdin (JSON array) and render an ASCII box diagram.

Each node has: id, title, status (optional), deps (array of dependency IDs).

Example:
  echo '[{"id":"A","title":"Auth","deps":[]},{"id":"B","title":"API","deps":["A"]}]' | whip task graph`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			data, err := io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("reading stdin: %w", err)
			}

			if len(data) == 0 {
				return fmt.Errorf("no input on stdin; pipe a JSON array of nodes")
			}

			var nodes []whip.GraphNode
			if err := json.Unmarshal(data, &nodes); err != nil {
				return fmt.Errorf("parsing JSON: %w", err)
			}

			if len(nodes) == 0 {
				fmt.Println("Empty graph.")
				return nil
			}

			result := whip.RenderGraph(nodes)
			fmt.Println(result)
			return nil
		},
	}

	return cmd
}
