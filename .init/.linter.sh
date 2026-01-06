#!/bin/bash
cd /home/kavia/workspace/code-generation/simple-task-manager-227475-227484/simple_to_do_app_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

