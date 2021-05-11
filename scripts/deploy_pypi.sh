#!/bin/bash

rm -rf build/
rm -rf dist/
rm -rf ocean_contracts.egg-info/
pip install --upgrade travis pip twine six==1.10.0 wheel==0.31.0 setuptools
pip list
shopt -s nullglob
touch ./artifacts/__init__.py
abifiles=( ./artifacts/* )
[ "${#abifiles[@]}" -lt "1" ] && echo "ABI Files for development environment not found" && exit 1
python setup.py sdist bdist_wheel
twine upload dist/*
