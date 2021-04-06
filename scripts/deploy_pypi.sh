#!/bin/bash

#pip3 install --upgrade --user travis pip
pip3 install --upgrade travis pip
#pip3 install --upgrade --user travis setuptools-rust twine six==1.10.0 wheel==0.31.0 setuptools
pip3 install --upgrade twine six==1.10.0 wheel==0.31.0 setuptools
pip3 show twine
pip3 list
shopt -s nullglob
abifiles=( ./artifacts/* )
[ "${#abifiles[@]}" -lt "1" ] && echo "ABI Files for development environment not found" && exit 1
python setup.py sdist bdist_wheel
twine upload dist/*