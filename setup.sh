#!/bin/sh
cat >> .git/info/exclude << 'EOF'
.claude
__pycache__/
*.pyc
*.pyo
EOF
echo "git info/exclude updated"
