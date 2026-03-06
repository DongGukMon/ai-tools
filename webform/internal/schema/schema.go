package schema

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
)

type Schema struct {
	Title       string            `json:"t"`
	Description string            `json:"d,omitempty"`
	Timeout     int               `json:"to,omitempty"`
	Fields      []json.RawMessage `json:"f"`
	raw         string
}

func ReadFromStdin() (*Schema, error) {
	data, err := io.ReadAll(os.Stdin)
	if err != nil {
		return nil, err
	}

	var s Schema
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, fmt.Errorf("invalid JSON: %w", err)
	}

	if len(s.Fields) == 0 {
		return nil, fmt.Errorf("schema must have at least one field")
	}

	s.raw = string(data)
	return &s, nil
}

func (s *Schema) JSON() string {
	return s.raw
}

func (s *Schema) SetRaw(raw string) {
	s.raw = raw
}

func Reference() string {
	return `Format: {"t":"title","d":"desc","to":timeout,"f":[[name,type,label,{opts}],...]}

Types:
  t       text            pw      password        ta      textarea
  n       number          sel     select          msel    multiselect
  rad     radio           cb      checkbox        url     url
  email   email           tel     tel             date    date
  time    time            dt      datetime        color   color
  range   range           file    file            json    json editor
  list    dynamic list    grp     field group

Opts:
  r       required (1/0)          ph      placeholder
  def     default value           o       options []
  pat     regex pattern           min     min value/length
  max     max value/length        step    step increment
  rows    textarea rows           it      item type (list)
  io      item opts (list)        f       sub fields (grp)
  accept  file accept types       mul     multiple files (1/0)

Example:
  {"t":"Config","f":[["key","pw","API Key",{"r":1}],["env","sel","Env",{"o":["dev","prod"]}]]}
`
}
