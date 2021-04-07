#!/bin/bash

shopt -s nullglob
abifiles=( ./artifacts/* )
[ "${#abifiles[@]}" -lt "1" ] && echo "ABI Files for development environment not found" && exit 1
python3 setup.py sdist bdist_wheel
twine upload dist/*