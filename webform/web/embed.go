package web

import _ "embed"

//go:embed index.html
var IndexHTML string

//go:embed style.css
var StyleCSS string

//go:embed form.js
var FormJS string
