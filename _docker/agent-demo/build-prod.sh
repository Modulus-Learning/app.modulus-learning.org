#!/bin/bash
# exit when any command fails
set -e

# params=()
# if [[ "$*" == *rebuild* ]]
# then
#     echo "Building maintenance with --rebuild option"
#     params+=('--rebuild')
# fi

if [ $# -gt 0 ]
  then
    echo "Building production agent demo with $@"
fi

cd _docker/agent-demo/production && ./build-prod.sh "$@"
cd ../../../
