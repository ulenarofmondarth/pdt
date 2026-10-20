# Configuration file for the Sphinx documentation builder.

import json
from pathlib import Path
#
# For the full list of built-in configuration values, see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Project information -----------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#project-information

project = 'Foundry VTT Package Developer Toolkit'
copyright = '2024, Ulenar of Mondarth'
author = 'Ulenar of Mondarth'
# pdt's version, from its package.json. The container sees it at /pdt/package.json (compose.yaml).
release = json.loads(Path('/pdt/package.json').read_text())['version']

# -- General configuration ---------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#general-configuration

extensions = ['myst_parser', 'sphinx.ext.todo', 'sphinxcontrib.mermaid']

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']


# -- MyST (Markdown) ---------------------------------------------------------
# https://myst-parser.readthedocs.io/en/latest/configuration.html

myst_enable_extensions = ['colon_fence', 'deflist', 'substitution']
myst_heading_anchors = 3

# Use as {{pdt}} and {{LSP}} in any page.
myst_substitutions = {
    'pdt': '{program}`pdt`',
    'LSP': '{abbr}`LSP (Language Server Protocol)`',
}


# -- Options for HTML output -------------------------------------------------
# https://www.sphinx-doc.org/en/master/usage/configuration.html#options-for-html-output

html_theme = 'furo'
html_static_path = ['_static']


# -- TODOs are shown in the output and listed on the front page. They do not count as
# warnings, so they do not fail the build.
# https://www.sphinx-doc.org/en/master/usage/extensions/todo.html

todo_include_todos = True
todo_emit_warnings = False
