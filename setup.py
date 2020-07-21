#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""The setup script."""

from setuptools import setup
import os
from glob import glob


with open('README.md') as readme_file:
    readme = readme_file.read()

requirements = []

setup_requirements = []


test_requirements = []
artifact_folder = './artifacts/*'
print("Adding all files in /{}".format(artifact_folder))
data_files = [(artifact_folder, [f for f in glob(os.path.join(artifact_folder, '*'))])]

print("data_files=")
for df in data_files:
    print(df)

setup(
    author="leucothia",
    author_email='devops@oceanprotocol.com',
    classifiers=[
        'Development Status :: 2 - Pre-Alpha',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: Apache Software License',
        'Natural Language :: English',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
        'Programming Language :: Python :: 3.6',
    ],
    description=" 🐳 Ocean Protocol L1 - v3",
    data_files=data_files,
    install_requires=requirements,
    license="Apache Software License 2.0",
    long_description=readme,
    long_description_content_type='text/markdown',
    include_package_data=True,
    keywords='ocean-contracts',
    name='ocean-contracts',
    setup_requires=setup_requirements,
    test_suite='tests',
    tests_require=test_requirements,
    url='https://github.com/oceanprotocol/ocean-contracts',
    version='0.3.3',
    zip_safe=False,
)