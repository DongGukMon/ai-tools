package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/bang9/ai-tools/redit/internal/redit"
)

// JSON-RPC types
type Request struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type Response struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id"`
	Result  any    `json:"result,omitempty"`
	Error   *Error `json:"error,omitempty"`
}

type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// MCP types
type InitializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	ServerInfo      ServerInfo   `json:"serverInfo"`
	Capabilities    Capabilities `json:"capabilities"`
}

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type Capabilities struct {
	Tools *ToolsCapability `json:"tools,omitempty"`
}

type ToolsCapability struct{}

type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema InputSchema `json:"inputSchema"`
}

type InputSchema struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties"`
	Required   []string            `json:"required,omitempty"`
}

type Property struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

type ToolsListResult struct {
	Tools []Tool `json:"tools"`
}

type ToolCallParams struct {
	Name      string          `json:"name"`
	Arguments json.RawMessage `json:"arguments"`
}

type ToolCallResult struct {
	Content []ContentBlock `json:"content"`
	IsError bool           `json:"isError,omitempty"`
}

type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

var store *redit.Store

func main() {
	var err error
	store, err = redit.NewStore()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize store: %v\n", err)
		os.Exit(1)
	}

	scanner := bufio.NewScanner(os.Stdin)
	// Increase buffer size for large content
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var req Request
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			continue
		}

		resp := handleRequest(req)
		if resp != nil {
			output, _ := json.Marshal(resp)
			fmt.Println(string(output))
		}
	}
}

func handleRequest(req Request) *Response {
	switch req.Method {
	case "initialize":
		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: InitializeResult{
				ProtocolVersion: "2024-11-05",
				ServerInfo: ServerInfo{
					Name:    "redit",
					Version: "1.0.0",
				},
				Capabilities: Capabilities{
					Tools: &ToolsCapability{},
				},
			},
		}

	case "notifications/initialized":
		return nil

	case "tools/list":
		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: ToolsListResult{
				Tools: getTools(),
			},
		}

	case "tools/call":
		var params ToolCallParams
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return errorResponse(req.ID, -32602, "Invalid params")
		}
		result := handleToolCall(params)
		return &Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  result,
		}

	default:
		return errorResponse(req.ID, -32601, "Method not found")
	}
}

func errorResponse(id any, code int, message string) *Response {
	return &Response{
		JSONRPC: "2.0",
		ID:      id,
		Error:   &Error{Code: code, Message: message},
	}
}

func getTools() []Tool {
	return []Tool{
		{
			Name:        "init",
			Description: "Initialize a new document cache. Stores content and returns the working file path for editing.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key":     {Type: "string", Description: "Unique identifier for the document (e.g., 'confluence:12345')"},
					"content": {Type: "string", Description: "The document content to store"},
				},
				Required: []string{"key", "content"},
			},
		},
		{
			Name:        "get",
			Description: "Get the working file path for an existing cached document.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key": {Type: "string", Description: "The document key"},
				},
				Required: []string{"key"},
			},
		},
		{
			Name:        "read",
			Description: "Read the current content of the working file.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key": {Type: "string", Description: "The document key"},
				},
				Required: []string{"key"},
			},
		},
		{
			Name:        "status",
			Description: "Check if the document has been modified. Returns 'dirty' if changed, 'clean' if unchanged.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key": {Type: "string", Description: "The document key"},
				},
				Required: []string{"key"},
			},
		},
		{
			Name:        "diff",
			Description: "Show the unified diff between the original and working copy.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key": {Type: "string", Description: "The document key"},
				},
				Required: []string{"key"},
			},
		},
		{
			Name:        "reset",
			Description: "Reset the working copy to the original content, discarding all changes.",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key": {Type: "string", Description: "The document key"},
				},
				Required: []string{"key"},
			},
		},
		{
			Name:        "drop",
			Description: "Remove the cached document (both original and working copy).",
			InputSchema: InputSchema{
				Type: "object",
				Properties: map[string]Property{
					"key": {Type: "string", Description: "The document key"},
				},
				Required: []string{"key"},
			},
		},
		{
			Name:        "list",
			Description: "List all cached documents with their status.",
			InputSchema: InputSchema{
				Type:       "object",
				Properties: map[string]Property{},
			},
		},
	}
}

func handleToolCall(params ToolCallParams) ToolCallResult {
	var args map[string]string
	if len(params.Arguments) > 0 {
		json.Unmarshal(params.Arguments, &args)
	}

	switch params.Name {
	case "init":
		key := args["key"]
		content := args["content"]
		if key == "" || content == "" {
			return toolError("key and content are required")
		}
		path, err := store.Init(key, strings.NewReader(content))
		if err != nil {
			return toolError(err.Error())
		}
		return toolSuccess(fmt.Sprintf("Initialized. Working file: %s", path))

	case "get":
		key := args["key"]
		if key == "" {
			return toolError("key is required")
		}
		path, err := store.Get(key)
		if err != nil {
			return toolError(err.Error())
		}
		return toolSuccess(path)

	case "read":
		key := args["key"]
		if key == "" {
			return toolError("key is required")
		}
		content, err := store.Read(key)
		if err != nil {
			return toolError(err.Error())
		}
		return toolSuccess(string(content))

	case "status":
		key := args["key"]
		if key == "" {
			return toolError("key is required")
		}
		status, err := store.Status(key)
		if err != nil {
			return toolError(err.Error())
		}
		return toolSuccess(status)

	case "diff":
		key := args["key"]
		if key == "" {
			return toolError("key is required")
		}
		diff, err := store.Diff(key)
		if err != nil {
			return toolError(err.Error())
		}
		if diff == "" {
			return toolSuccess("No changes")
		}
		return toolSuccess(diff)

	case "reset":
		key := args["key"]
		if key == "" {
			return toolError("key is required")
		}
		if err := store.Reset(key); err != nil {
			return toolError(err.Error())
		}
		return toolSuccess("Reset complete")

	case "drop":
		key := args["key"]
		if key == "" {
			return toolError("key is required")
		}
		if err := store.Drop(key); err != nil {
			return toolError(err.Error())
		}
		return toolSuccess("Dropped")

	case "list":
		items, err := store.List()
		if err != nil {
			return toolError(err.Error())
		}
		if len(items) == 0 {
			return toolSuccess("No cached documents")
		}
		var lines []string
		lines = append(lines, "KEY\tSTATUS\tPATH")
		for _, item := range items {
			lines = append(lines, fmt.Sprintf("%s\t%s\t%s", item.Key, item.Status, item.Path))
		}
		return toolSuccess(strings.Join(lines, "\n"))

	default:
		return toolError(fmt.Sprintf("Unknown tool: %s", params.Name))
	}
}

func toolSuccess(text string) ToolCallResult {
	return ToolCallResult{
		Content: []ContentBlock{{Type: "text", Text: text}},
	}
}

func toolError(message string) ToolCallResult {
	return ToolCallResult{
		Content: []ContentBlock{{Type: "text", Text: "Error: " + message}},
		IsError: true,
	}
}
